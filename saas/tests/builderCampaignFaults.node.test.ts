// saas/tests/builderCampaignFaults.node.test.ts
//
// PAC-07..PAC-10 in isolation: the controlled provider stubs, the fixed judge, and the inference seam that routes
// a scoped call to the stub instead of the network.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFaultStub, judgeFault, truncatedAnswerText,
  FAULT_PROMPT, FAULT_COMPLETE_ANSWER, FAULT_MAX_PROVIDER_CALLS, FAULT_TURN_DEADLINE_MS, FAULT_DEADLINE_GRACE_MS,
  type FaultObservation, type ProviderCall,
} from '../lib/builder/campaign/faults.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
import { verifyAnswerOutcome } from '../lib/ai/cos/answerOutcomeVerifier.ts'
import { stubOutcomeJudge, unavailableOutcomeJudge } from './helpers/answerOutcomeJudgeStub.ts'
import { parseLocalResult } from '../lib/ai/cos/reasonerOutput.ts'
import { withInferenceTransport, currentInferenceTransport } from '../lib/ai/inferenceTransport.ts'
import { callLocalModelTurn, LOCAL_MODEL_OUTPUT_TRUNCATED } from '../lib/ai/local-inference.ts'
import { withHostProductionHarnessIngress } from '../platform-harness/runtime/host-ingress.ts'

const init = (signal: AbortSignal = new AbortController().signal) => ({ method: 'POST', headers: {}, body: '{}', signal })
const completeText = JSON.stringify({ answer: FAULT_COMPLETE_ANSWER, confidence: 0.7 })
const call = (index: number, outcome: string, cancelled = false): ProviderCall => ({ index, outcome, cancelled, startedAfterMs: 0, endedAfterMs: 10 })
const completeOutcome = await verifyAnswerOutcome({ request: FAULT_PROMPT, answer: FAULT_COMPLETE_ANSWER, judge: stubOutcomeJudge })
const observe = (partial: Partial<FaultObservation> & { fault: FaultObservation['fault'] }): FaultObservation => ({
  calls: [call(1, '200')], released: null, escaped: null, elapsedMs: 1_000, releasedOutcome: partial.released === completeText ? completeOutcome : null, ...partial,
})

test('the fault prompt is a three-task analytical request and the verifier finds the stub answer complete', () => {
  assert.equal(requestedAnalyticalTasks(FAULT_PROMPT).length, 3)
  assert.equal(completeOutcome.status, 'verified')
  assert.equal(completeOutcome.deliverables.length, 3)
  const truncated = parseLocalResult(truncatedAnswerText())
  assert.equal(truncated?.truncated, true)
})

test('runpod_busy: the first call is refused 503, later calls answer completely', async () => {
  const stub = createFaultStub('runpod_busy')
  const first = await stub.transport('u', init())
  const second = await stub.transport('u', init())
  assert.equal(first.status, 503)
  assert.equal(second.status, 200)
  const body = await second.json() as { choices: Array<{ message: { content: string }; finish_reason: string }> }
  assert.equal(body.choices[0].finish_reason, 'stop')
  assert.equal(body.choices[0].message.content, completeText)
  assert.deepEqual(stub.calls().map(item => item.outcome), ['503', '200'])
})

test('model_timeout: a call hangs until the caller cancels it, and the cancellation is recorded', async () => {
  const stub = createFaultStub('model_timeout')
  const controller = new AbortController()
  const pending = stub.transport('u', init(controller.signal))
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(stub.calls()[0].outcome, 'hang')
  controller.abort(new DOMException('Inference transport deadline exceeded', 'TimeoutError'))
  await assert.rejects(pending, (error: Error) => error.name === 'TimeoutError')
  assert.equal(stub.calls()[0].outcome, 'cancelled')
  assert.equal(stub.calls()[0].cancelled, true)
})

test('output_truncation: every call returns a cut-off generation with finish_reason length', async () => {
  const stub = createFaultStub('output_truncation')
  const body = await (await stub.transport('u', init())).json() as { choices: Array<{ message: { content: string }; finish_reason: string }> }
  assert.equal(body.choices[0].finish_reason, 'length')
  assert.equal(body.choices[0].message.content, truncatedAnswerText())
})

test('malformed_output: broken JSON, empty text and missing keys, in turn', async () => {
  const stub = createFaultStub('malformed_output')
  const contents: string[] = []
  for (let index = 0; index < 4; index += 1) {
    const body = await (await stub.transport('u', init())).json() as { choices: Array<{ message: { content: string } }> }
    contents.push(body.choices[0].message.content)
  }
  assert.throws(() => JSON.parse(contents[0]))
  assert.equal(contents[1], '')
  assert.deepEqual(Object.keys(JSON.parse(contents[2])), ['result', 'score'])
  assert.equal(contents[3], contents[0])
})

test('judge: a parseable release the verifier could not grade is BLOCKED, never PASS', async () => {
  const ungraded = await verifyAnswerOutcome({ request: FAULT_PROMPT, answer: FAULT_COMPLETE_ANSWER, judge: unavailableOutcomeJudge })
  const result = judgeFault(observe({ fault: 'runpod_busy', calls: [call(1, '503'), call(2, '200')], released: completeText, releasedOutcome: ungraded }))
  assert.equal(result.verdict, 'BLOCKED')
  assert.equal(result.failureCause, 'independent outcome verifier unavailable')
})

test('judge: governed recovery and bounded failure both pass runpod_busy; a retry storm fails it', () => {
  assert.equal(judgeFault(observe({ fault: 'runpod_busy', calls: [call(1, '503'), call(2, '200')], released: completeText })).verdict, 'PASS')
  assert.equal(judgeFault(observe({ fault: 'runpod_busy', calls: [call(1, '503')] })).verdict, 'PASS')
  const storm = judgeFault(observe({ fault: 'runpod_busy', calls: Array.from({ length: FAULT_MAX_PROVIDER_CALLS + 1 }, (_, i) => call(i + 1, '503')) }))
  assert.equal(storm.verdict, 'FAIL')
  assert.match(storm.actual, /exceeds the ceiling/)
})

test('judge: model_timeout passes only when every hung call was cancelled, nothing was released and the turn ended in time', () => {
  assert.equal(judgeFault(observe({ fault: 'model_timeout', calls: [call(1, 'cancelled', true)], elapsedMs: FAULT_TURN_DEADLINE_MS + 1_000 })).verdict, 'PASS')
  const notCancelled = judgeFault(observe({ fault: 'model_timeout', calls: [call(1, 'hang', false)] }))
  assert.equal(notCancelled.verdict, 'FAIL')
  assert.match(notCancelled.actual, /not cancelled/)
  const overran = judgeFault(observe({ fault: 'model_timeout', calls: [call(1, 'cancelled', true)], elapsedMs: FAULT_TURN_DEADLINE_MS + FAULT_DEADLINE_GRACE_MS + 1 }))
  assert.equal(overran.verdict, 'FAIL')
  assert.match(overran.actual, /past its/)
})

test('judge: output_truncation fails when the cut text is released and passes an honest terminal failure', () => {
  assert.equal(judgeFault(observe({ fault: 'output_truncation', calls: [call(1, '200 length'), call(2, '200 length')] })).verdict, 'PASS')
  const presented = judgeFault(observe({ fault: 'output_truncation', released: truncatedAnswerText() }))
  assert.equal(presented.verdict, 'FAIL')
  assert.match(presented.actual, /incomplete answer was released/)
})

test('judge: malformed_output fails when an exception escapes and passes a bounded null', () => {
  assert.equal(judgeFault(observe({ fault: 'malformed_output', calls: [call(1, '200 broken_json'), call(2, '200 empty')] })).verdict, 'PASS')
  const escaped = judgeFault(observe({ fault: 'malformed_output', escaped: 'SyntaxError: Unexpected token' }))
  assert.equal(escaped.verdict, 'FAIL')
  assert.match(escaped.actual, /exception escaped/)
  assert.equal(judgeFault(observe({ fault: 'malformed_output', calls: [] })).verdict, 'FAIL')
})

const config = { baseUrl: 'http://stub.invalid/v1', model: 'stub-model', timeoutMs: 5_000, provider: 'stub' }
const args = { prompt: FAULT_PROMPT, temperature: 0, maxTokens: 800, usageContext: { feature: 'cos_interactive_answer', purpose: 'verification_campaign_fault' } }

test('seam: inside withInferenceTransport the model call goes to the stub, outside it the scope is empty', async () => {
  assert.equal(currentInferenceTransport(), null)
  const stub = createFaultStub('runpod_busy')
  const turns = await withInferenceTransport(stub.transport, async () => [
    await callLocalModelTurn(args, config),
    await callLocalModelTurn(args, config),
  ])
  assert.equal(currentInferenceTransport(), null)
  assert.equal(turns[0], null)
  assert.equal(turns[1]?.content, completeText)
  assert.deepEqual(stub.calls().map(item => item.outcome), ['503', '200'])
})

test('seam: a hung stub call is cancelled by the inference deadline and the turn returns null', async () => {
  const stub = createFaultStub('model_timeout')
  const startedAt = Date.now()
  const turn = await withInferenceTransport(stub.transport, () => callLocalModelTurn({ ...args, timeoutMs: 300 }, config))
  assert.equal(turn, null)
  assert.ok(Date.now() - startedAt < 3_000)
  assert.equal(stub.calls()[0].cancelled, true)
})

test('seam: a cut-off generation is refused as truncated, never returned as content', async () => {
  const stub = createFaultStub('output_truncation')
  await assert.rejects(
    withInferenceTransport(stub.transport, () => callLocalModelTurn(args, config)),
    (error: Error) => error.message === LOCAL_MODEL_OUTPUT_TRUNCATED,
  )
})

// Production 2026-10-28: the campaign runs inside the durable Builder job harness, whose DeepInfra spend ceiling
// refused every fault turn before it reached the stub ("the reasoner made no provider call" on PAC-07..10).
const builderJobHarness = <T>(operation: () => Promise<T>) => withHostProductionHarnessIngress({
  objective: 'Execute durable Builder job campaign-fault-test', portableId: 'cos-builder', agentId: 'cos-builder-worker',
  role: 'software_specialist', capabilityId: 'builder.job.execute', risk: 'write', deadlineMs: 300_000, maxConcurrency: 1,
  maxToolCalls: 200, maxCostUsd: 0.24, runId: 'builder-job-campaign-fault-test',
}, operation)
const deepinfraConfig = { baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'stub-model', timeoutMs: 5_000, provider: 'deepinfra' }

test('seam: inside the Builder job harness a controlled-transport call reaches its stub without a spend reservation', async () => {
  const stub = createFaultStub('runpod_busy')
  const turns = await builderJobHarness(() => withInferenceTransport(stub.transport, async () => [
    await callLocalModelTurn(args, deepinfraConfig),
    await callLocalModelTurn(args, deepinfraConfig),
  ]))
  assert.deepEqual(stub.calls().map(item => item.outcome), ['503', '200'])
  assert.equal(turns[1]?.content, completeText)
})

test('seam: inside the Builder job harness a real DeepInfra call without a reservation is still refused before the network', async () => {
  const realFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = (async () => { networkCalls++; throw new Error('network must not be reached') }) as typeof fetch
  try {
    const turn = await builderJobHarness(() => callLocalModelTurn(args, deepinfraConfig)).catch((error: Error) => error)
    assert.ok(turn === null || (turn instanceof Error && turn.message === 'deepinfra_harness_cost_reservation_required'), String(turn))
    assert.equal(networkCalls, 0)
  } finally {
    globalThis.fetch = realFetch
  }
})
