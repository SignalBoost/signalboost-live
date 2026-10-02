// saas/tests/cosWorkforceAbandonedAssignments.node.test.ts
//
// Production trace 2026-10-02 of 39 assignments closed as 'no_terminal_recorded': 25 recorded timeout, 12 recorded
// empty (both at the ~15s deadline), 1 recorded success, 1 with no serving record. The results existed in the
// serving-attempt log; the closing writes had been rejected by the old status rule and the rejection ignored.
// The terminal state must be derived from that evidence, never closed blindly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decideAssignmentTerminal } from '../lib/ai/cos/cosWorkforceVerificationPolicy.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const now = Date.parse('2026-10-02T04:00:00Z')
const MAX = 10 * 60_000
const old = now - 60 * 60_000

test('a recorded success closes as served (the work is not lost)', () => {
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: old, maxOpenMs: MAX, evidence: [
    { phase: 'attempt_started' }, { phase: 'attempt_succeeded', outcome: 'success', latency_ms: 10358 },
  ] }), { close: true, status: 'served', failureReason: null })
})

test('a recorded failure closes with its real reason, not no_terminal_recorded', () => {
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: old, maxOpenMs: MAX, evidence: [
    { phase: 'attempt_started' }, { phase: 'attempt_failed', outcome: 'timeout', error_class: 'runtime_deadline_exceeded' },
  ] }), { close: true, status: 'runtime_failed', failureReason: 'runtime_deadline_exceeded' })
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: old, maxOpenMs: MAX, evidence: [
    { phase: 'attempt_failed', outcome: 'empty', error_class: 'empty_response' },
  ] }), { close: true, status: 'runtime_failed', failureReason: 'empty_response' })
})

test('without a result, only an old assignment closes, and it says which kind of loss it was', () => {
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: now - 60_000, maxOpenMs: MAX, evidence: [{ phase: 'attempt_started' }] }),
    { close: false, reason: 'still_open_within_window' })
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: old, maxOpenMs: MAX, evidence: [{ phase: 'attempt_started' }] }),
    { close: true, status: 'runtime_failed', failureReason: 'process_ended_mid_call' })
  assert.deepEqual(decideAssignmentTerminal({ nowMs: now, openedAtMs: old, maxOpenMs: MAX, evidence: [] }),
    { close: true, status: 'runtime_failed', failureReason: 'no_serving_record' })
})

test('the reconciler re-derives the blind no_terminal_recorded closes and never touches finished work', () => {
  const src = read('lib/ai/cos/cosWorkforceAssignments.ts')
  const fn = src.slice(src.indexOf('export async function closeAbandonedWorkforceAssignments'))
  assert.match(fn, /\.in\('status', \['assigned', 'working'\]\)/)
  assert.match(fn, /\.eq\('status', 'runtime_failed'\)\s+\.eq\('failure_reason', LEGACY_BLIND_CLOSE_REASON\)/)
  assert.match(fn, /from\('cos_university_graduate_serving_attempts'\)/)
  assert.match(fn, /decideAssignmentTerminal\(/)
  assert.match(fn, /\.eq\('id', row\.id\)\s+\.eq\('status', row\.status\)/, 'guarded update: no race with a live close')
  assert.doesNotMatch(fn, /'verified'|'remediation'|\.delete\(/)
  assert.match(fn, /\.\.\.\(row\.status === 'runtime_failed' \? \{\} : \{ completed_at: at \}\)/, 'legacy re-derivation keeps its original completion time')
})

test('terminal writes are checked, and a deadline failure records the endpoint worker state', () => {
  const workers = read('lib/ai/cos/cosReasoningWorkers.ts')
  const shadow = workers.slice(workers.indexOf('export async function runWorkforceApprenticeShadow('), workers.indexOf('async function routingDecision('))
  assert.doesNotMatch(shadow, /db\.from\('cos_workforce_assignments'\)\.update\(\{ status: '(served|runtime_failed)'/, 'no unchecked terminal write')
  assert.match(shadow, /closeWorkforceAssignment\(db, assignmentId, \{ status: 'served'/)
  assert.match(shadow, /runtime_deadline_exceeded:\$\{await runpodGraduateEndpointWorkerState\(runtime\.inference\.baseUrl\)\}/)
  assert.match(workers, /terminal write rejected; serving-attempt evidence will reconcile it/)
  const gate = read('lib/ai/cos/graduateWarmGate.ts')
  assert.match(gate, /export async function runpodGraduateEndpointWorkerState/)
})

test('the Workforce cron reconciles first and never starts a call it cannot finish', () => {
  const route = read('app/api/cron/cos-workforce-pipeline/route.ts')
  const close = route.indexOf('closeAbandonedWorkforceAssignments()')
  const verify = route.indexOf('verifyServedWorkforceAssignments()')
  assert.ok(close > 0 && verify > close)
  // Owner 2026-10-02: no paid wake-ups - the cron never waits for a graduate endpoint to boot.
  assert.match(route, /export const maxDuration = 60\nconst RUN_BUDGET_MS = 50_000\nconst SHADOW_MAX_MS = 15_000/)
  assert.doesNotMatch(route, /proveGraduateServedIdentity/)
  assert.match(route, /const shadowTimeoutMs = Math\.min\(SHADOW_MAX_MS, deadline - Date\.now\(\) - SHADOW_CLOSE_MARGIN_MS\)\s+if \(shadowTimeoutMs < 5_000\) break/)
  assert.match(route, /timeoutMs: shadowTimeoutMs,/)
  assert.match(route, /abandonedAssignmentsClosed: abandoned\.closed/)
})
test('practice work never boots a powered-off graduate endpoint (no paid wake-ups)', () => {
  const workers = read('lib/ai/cos/cosReasoningWorkers.ts')
  const shadow = workers.slice(workers.indexOf('export async function runWorkforceApprenticeShadow('), workers.indexOf('async function routingDecision('))
  const gate = shadow.indexOf('if (!(await runpodGraduateEndpointWarm(runtime.inference.baseUrl))) return')
  const opens = shadow.indexOf("from('cos_workforce_assignments').upsert(")
  const calls = shadow.indexOf('await callLocalModel(')
  assert.ok(gate > 0 && opens > gate && calls > gate, 'warm check before any assignment or graduate call')
})
// end of saas/tests/cosWorkforceAbandonedAssignments.node.test.ts (if this line is missing, the paste was cut short)
