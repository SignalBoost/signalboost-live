import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { classifyRunpodFailure, runpodCapacityUnavailableReason } from '../lib/ai/cos/runpodCapacityError.ts'

const firstAnswerSource = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
const orchestrationSource = readFileSync(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')

test('exact production RunPod capacity message is classified', () => {
  const result = classifyRunpodFailure('RunPod GraphQL error: There are not enough free GPUs on the host machine to start this pod.')
  assert.equal(result.capacityUnavailable, true)
  assert.ok(result.matchedPattern)
})

test('known RunPod capacity phrasings are classified', () => {
  for (const message of [
    'RunPod: no gpu instances available in this region',
    'RunPod: insufficient GPU capacity for this request',
    'RunPod: no capacity is available right now',
  ]) {
    assert.equal(classifyRunpodFailure(message).capacityUnavailable, true)
  }
})

test('fallback-provider capacity wording is not mislabeled as RunPod', () => {
  assert.equal(classifyRunpodFailure('DeepInfra: insufficient GPU capacity for this request').capacityUnavailable, false)
})

test('unrelated failures are not classified as capacity', () => {
  for (const message of ['fetch failed: aborted','RunPod GraphQL HTTP 401: Unauthorized','Reasoner unavailable (cold start): no safe RunPod readiness budget remains','not allowed to wake RunPod']) {
    assert.equal(classifyRunpodFailure(message).capacityUnavailable, false)
  }
})

test('capacity reason names the pod, fallback, and preserves original wording', () => {
  const reason = runpodCapacityUnavailableReason({ podId: 'examplepod', originalMessage: 'There are not enough free GPUs on the host machine to start this pod.' })
  assert.match(reason, /RunPod primary capacity unavailable/)
  assert.match(reason, /examplepod/)
  assert.match(reason, /DeepInfra fallback/)
  assert.match(reason, /not enough free GPUs/)
})

test('normal COS preflight preserves capacity failure instead of flattening it', () => {
  assert.match(firstAnswerSource, /classifyRunpodFailure\(reason\)/)
  assert.match(firstAnswerSource, /runpodCapacityUnavailableReason\(/)
})

test('orchestration maps capacity failure before generic no-answer failure', () => {
  const capacityIndex = orchestrationSource.indexOf('runpod_gpu_capacity_unavailable')
  const genericIndex = orchestrationSource.indexOf('local_reasoner_no_answer')
  assert.ok(capacityIndex > 0 && genericIndex > 0)
  assert.ok(capacityIndex < genericIndex)
})
