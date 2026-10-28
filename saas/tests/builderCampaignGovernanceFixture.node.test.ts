// saas/tests/builderCampaignGovernanceFixture.node.test.ts
//
// PAC-17 (governance read-back) and PAC-18 (the Builder's fail → change → pass cycle on the fixture): the fixed
// judges, and the runner carrying a fixture run across slices.

import test from 'node:test'
import assert from 'node:assert/strict'
import { judgeGovernance, GOVERNANCE_TURN_CEILING_MS, GOVERNANCE_MAX_CALLS_PER_TURN, type CallRecord, type TurnRecord } from '../lib/builder/campaign/governance.ts'
import { judgeFixture, newFixtureSession, FIXTURE_COMMAND, FIXTURE_FILES, FIXTURE_OBJECTIVE, type FixtureSession } from '../lib/builder/campaign/fixture.ts'
import { builderTaskContract } from '../lib/builder/task-contract.ts'
import { runCampaignSlice, emptyCampaignLedger } from '../lib/builder/campaign/runner.ts'
import { PAC_CATALOG } from '../lib/builder/campaign/catalog.ts'
import type { CampaignPorts } from '../lib/builder/campaign/ports.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'

const turn = (id: string, patch: Partial<TurnRecord> = {}): TurnRecord => ({ turnId: id, totalMs: 90_000, modelCalls: 4, answered: true, failureReason: null, ...patch })
const call = (patch: Partial<CallRecord> = {}): CallRecord => ({ provider: 'runpod', purpose: 'answer', success: true, finishReason: 'stop', latencyMs: 20_000, ...patch })
const window = '2026-10-28T00:00:00.000Z'

test('governance: bounded turns, explained failures and authorized providers pass', () => {
  const result = judgeGovernance({
    turns: [turn('t1'), turn('t2', { answered: false, failureReason: 'timeout:inference_transport_deadline' })],
    calls: [call(), call({ provider: 'deepinfra', success: false, finishReason: 'timeout:inference_transport_deadline' }), call({ finishReason: 'runpod_busy_background_work', success: false })],
    windowStart: window,
  })
  assert.equal(result.verdict, 'PASS', result.actual)
  assert.ok(result.evidence.some(item => /2 turn record/.test(item.detail)))
})

test('governance: each rule of the brief fails on its own evidence', () => {
  const base = { calls: [call()], windowStart: window }
  const check = (input: Parameters<typeof judgeGovernance>[0], pattern: RegExp) => {
    const result = judgeGovernance(input)
    assert.equal(result.verdict, 'FAIL')
    assert.match(result.actual, pattern)
  }
  check({ ...base, turns: [turn('t1', { totalMs: GOVERNANCE_TURN_CEILING_MS + 1 })] }, /outlived/)
  check({ ...base, turns: [turn('t1', { modelCalls: GOVERNANCE_MAX_CALLS_PER_TURN + 1 })] }, /more than/)
  check({ turns: [turn('t1')], calls: [call({ latencyMs: GOVERNANCE_TURN_CEILING_MS + 1 })], windowStart: window }, /ran past/)
  check({ turns: [turn('t1')], calls: [call({ finishReason: 'runpod_busy_background_work' }), call({ finishReason: 'runpod_busy_background_work' })], windowStart: window }, /background work held/)
  check({ ...base, turns: [turn('t1', { answered: false, failureReason: null })] }, /no failure reason/)
  check({ turns: [turn('t1')], calls: [call({ success: false, finishReason: null })], windowStart: window }, /no finish reason/)
  check({ turns: [turn('t1')], calls: [call({ provider: 'openai' })], windowStart: window }, /unauthorized route: openai/)
  assert.equal(judgeGovernance({ turns: [], calls: [call()], windowStart: window }).verdict, 'BLOCKED')
})

const receipt = (tool: BuilderV2Receipt['tool'], ok: boolean, output: unknown, changed = false): BuilderV2Receipt => ({ tool, ok, changed, output })
const run = (ok: boolean, command = FIXTURE_COMMAND) => receipt('run_tests', ok, { exitCode: ok ? 0 : 1, stdout: '', stderr: '', timedOut: false, executedCommand: command, requestedCommand: command })
const fixedModule = FIXTURE_FILES['app.js'].replace('sum + line.price', 'sum + line.price * line.quantity')

test('fixture: the objective names the real command and the files carry the planted defect', () => {
  assert.deepEqual(builderTaskContract(FIXTURE_OBJECTIVE).commands, [FIXTURE_COMMAND])
  assert.match(FIXTURE_FILES['app.js'], /sum \+ line\.price,/)
  assert.match(FIXTURE_FILES['app.test.js'], /quantity: 3/)
})

test('fixture: fail, inspect, minimal change, pass with the same command is PASS', () => {
  const result = judgeFixture({
    ok: true, reason: 'finished', elapsedMs: 180_000,
    receipts: [run(false), receipt('read_file', true, { path: 'app.js', content: FIXTURE_FILES['app.js'] }), receipt('edit_file', true, { path: 'app.js' }, true), run(true)],
    files: { 'app.js': fixedModule, 'app.test.js': FIXTURE_FILES['app.test.js'] },
  })
  assert.equal(result.verdict, 'PASS', result.actual)
  assert.ok(result.evidence.some(item => item.label === 'app.js after repair' && /quantity/.test(item.detail)))
  assert.ok(result.evidence.some(item => /run_tests ".*app\.test\.js": failed/.test(item.detail)))
})

test('fixture: a modified test, an unreproduced failure, a pass before the failure, or an unfinished run is FAIL', () => {
  const good = { ok: true, reason: 'finished', elapsedMs: 1_000, receipts: [run(false), receipt('edit_file', true, { path: 'app.js' }, true), run(true)], files: { 'app.js': fixedModule, 'app.test.js': FIXTURE_FILES['app.test.js'] } }
  assert.equal(judgeFixture(good).verdict, 'PASS')
  assert.match(judgeFixture({ ...good, files: { ...good.files, 'app.test.js': 'test("x", () => {})' } }).actual, /app\.test\.js was modified/)
  assert.match(judgeFixture({ ...good, receipts: [receipt('edit_file', true, { path: 'app.js' }, true), run(true)] }).actual, /not reproduced/)
  assert.match(judgeFixture({ ...good, receipts: [run(true), receipt('edit_file', true, { path: 'app.js' }, true), run(false)] }).actual, /passing run precedes the reproduced failure/)
  assert.match(judgeFixture({ ...good, receipts: [run(false), receipt('edit_file', true, { path: 'app.js' }, true), run(false)] }).actual, /no passing run/)
  assert.match(judgeFixture({ ...good, ok: false, reason: 'builder_v2_model_call_budget_exhausted' }).actual, /stopped without a passing run: builder_v2_model_call_budget_exhausted/)
  assert.match(judgeFixture({ ...good, receipts: [run(false), receipt('write_file', true, { path: 'helper.js' }, true), run(true)], files: { ...good.files, 'helper.js': 'x' } }).actual, /app\.js was neither read nor edited/)
})

test('runner: a pending fixture run is checkpointed and continued; governance receives the campaign\'s turn ids and start', async () => {
  const seen: Array<{ session: FixtureSession | null }> = []
  let governanceInput: { ids: readonly string[]; windowStart: string } | null = null
  let first = true
  const ports: CampaignPorts = {
    deployment: async () => ({ mainCommit: 'abc' }),
    analysis: async prompt => ({ status: 200, ok: true, reply: prompt, source: 'x', correlationId: 'turn-1', latencyMs: 1_000, servedCommit: 'abc', model: 'm', localModelInvoked: true, executionAllowed: false }),
    governance: async (ids, windowStart) => { governanceInput = { ids, windowStart }; return { verdict: 'PASS', actual: 'ok', evidence: [] } },
    builderFixture: async session => {
      seen.push({ session })
      const current = session ?? newFixtureSession(0)
      if (first) { first = false; return { status: 'pending', session: { ...current, receipts: [run(false)] } } }
      return { status: 'done', session: current, result: { verdict: 'PASS', actual: 'ok', evidence: [] } }
    },
  }
  const only = PAC_CATALOG.filter(item => ['PAC-06', 'PAC-17', 'PAC-18'].includes(item.id))
  const ledger = emptyCampaignLedger('COS-PAC-001')
  const slice1 = await runCampaignSlice({ catalog: only, state: { ledger, reliability: null }, ports, remainingMs: () => 10 * 60_000 })
  assert.equal(slice1.stopped, 'budget')
  assert.equal(slice1.fixture?.receipts.length, 1)
  assert.deepEqual(slice1.ledger.rows.map(row => row.testId), ['PAC-06', 'PAC-17'])
  assert.deepEqual(governanceInput, { ids: ['turn-1'], windowStart: ledger.startedAt })
  const slice2 = await runCampaignSlice({ catalog: only, state: { ...slice1, reliability: null }, ports, remainingMs: () => 10 * 60_000 })
  assert.equal(slice2.stopped, 'complete')
  assert.equal(seen[1].session?.receipts.length, 1, 'the second slice resumes the checkpointed fixture session')
  assert.equal(slice2.fixture, null)
  assert.deepEqual(slice2.ledger.rows.map(row => `${row.testId}:${row.verdict}`), ['PAC-06:FAIL', 'PAC-17:PASS', 'PAC-18:PASS'])
})
