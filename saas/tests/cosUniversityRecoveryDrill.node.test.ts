// saas/tests/cosUniversityRecoveryDrill.node.test.ts
// The drill exists to make item 12 falsifiable: a stopped distillation control loop must be detected,
// repaired and resumed without owner intervention. These tests pin the properties that make the result
// worth trusting - it can fail, it can be void, and it always cleans up.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  RECOVERY_DRILL_MAX_TTL_SECONDS,
  assertRecoveryDrillBounded,
  evaluateRecoveryDrill,
  planRecoveryDrill,
  type RecoveryDrillAction,
  type RecoveryDrillRecord,
  type RecoveryDrillSnapshot,
} from '../lib/ai/cos/cosUniversityRecoveryDrill.ts'

const ARMED = '2026-09-19T03:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(ARMED) + minutes * 60_000).toISOString()

const drill: RecoveryDrillRecord = {
  drillId: 'drill-1',
  faultKind: 'dispatch_claim_stalled',
  injectedRunId: 'run-synthetic-1',
  armedAt: ARMED,
  expiresAt: at(15),
  detectionDeadlineSeconds: 300,
  repairDeadlineSeconds: 600,
}

const snapshot = (minutes: number, reasons: string[]): RecoveryDrillSnapshot =>
  ({ checkedAt: at(minutes), state: reasons.length ? 'repair_required' : 'healthy', reasons })

const action = (minutes: number, kind: RecoveryDrillAction['kind'],
  actor: RecoveryDrillAction['actor'] = 'supervisor',
  runId: string | null = drill.injectedRunId): RecoveryDrillAction =>
  ({ observedAt: at(minutes), kind, actor, runId })

test('a full autonomous recovery passes and reports each stage', () => {
  const verdict = evaluateRecoveryDrill({
    drill,
    snapshots: [snapshot(1, []), snapshot(3, ['dispatch_claim_stalled']), snapshot(9, [])],
    actions: [action(2, 'incident_opened'), action(7, 'repair_applied')],
    now: new Date(at(10)),
  })
  assert.equal(verdict.verdict, 'passed')
  assert.equal(verdict.autonomous, true)
  assert.equal(verdict.detectedAfterSeconds, 180)
  assert.equal(verdict.repairedAfterSeconds, 420)
  assert.equal(verdict.resumedAfterSeconds, 540)
  assert.equal(verdict.rollbackRequired, true)
})

test('a repair by anyone other than the supervisor is VOID, never a pass', () => {
  for (const actor of ['owner', 'other_agent', 'unknown'] as const) {
    const verdict = evaluateRecoveryDrill({
      drill,
      snapshots: [snapshot(3, ['dispatch_claim_stalled']), snapshot(9, [])],
      actions: [action(2, 'incident_opened'), action(7, 'repair_applied', actor)],
      now: new Date(at(10)),
    })
    assert.equal(verdict.verdict, 'void', actor)
    assert.equal(verdict.autonomous, false, actor)
    assert.match(verdict.reason, new RegExp(`^manual_${actor}_`))
  }
})

test('an undetected fault fails once the detection deadline passes', () => {
  const running = evaluateRecoveryDrill({
    drill, snapshots: [snapshot(1, [])], actions: [], now: new Date(at(4)),
  })
  assert.equal(running.verdict, 'running')
  assert.equal(running.reason, 'awaiting_detection')

  const failed = evaluateRecoveryDrill({
    drill, snapshots: [snapshot(1, [])], actions: [], now: new Date(at(6)),
  })
  assert.equal(failed.verdict, 'failed')
  assert.equal(failed.reason, 'fault_not_detected_within_deadline')
})

test('a detected fault that is never repaired fails at the repair deadline', () => {
  const verdict = evaluateRecoveryDrill({
    drill,
    snapshots: [snapshot(2, ['dispatch_claim_stalled']), snapshot(9, ['dispatch_claim_stalled'])],
    actions: [action(3, 'incident_opened')],
    now: new Date(at(11)),
  })
  assert.equal(verdict.verdict, 'failed')
  assert.equal(verdict.reason, 'fault_detected_but_not_repaired_within_deadline')
  assert.equal(verdict.detectedAfterSeconds, 120)
})

test('repair without a subsequent healthy snapshot is not a pass', () => {
  const verdict = evaluateRecoveryDrill({
    drill,
    snapshots: [snapshot(2, ['dispatch_claim_stalled'])],
    actions: [action(3, 'incident_opened'), action(4, 'repair_applied')],
    now: new Date(at(5)),
  })
  assert.equal(verdict.verdict, 'running')
  assert.equal(verdict.reason, 'awaiting_resume')
  assert.equal(verdict.resumedAfterSeconds, null)
})

test('expiry ends the drill as failed rather than leaving it open', () => {
  const verdict = evaluateRecoveryDrill({
    drill,
    snapshots: [snapshot(2, ['dispatch_claim_stalled'])],
    actions: [action(3, 'incident_opened'), action(4, 'repair_applied')],
    now: new Date(at(16)),
  })
  assert.equal(verdict.verdict, 'failed')
  assert.equal(verdict.reason, 'drill_expired_before_resume')
})

test('events for another run or before arming are ignored', () => {
  const verdict = evaluateRecoveryDrill({
    drill,
    snapshots: [snapshot(-5, ['dispatch_claim_stalled']), snapshot(9, [])],
    actions: [action(2, 'repair_applied', 'owner', 'someone-elses-run')],
    now: new Date(at(10)),
  })
  // The owner action belongs to a different run, so it is not interference; and the pre-arming
  // snapshot cannot supply detection.
  assert.equal(verdict.verdict, 'failed')
  assert.equal(verdict.reason, 'fault_not_detected_within_deadline')
})

test('every terminal verdict demands rollback before the drill may complete', () => {
  const terminal = [
    { snapshots: [snapshot(3, ['dispatch_claim_stalled']), snapshot(9, [])], actions: [action(7, 'repair_applied')], now: at(10) },
    { snapshots: [snapshot(1, [])], actions: [], now: at(6) },
    { snapshots: [snapshot(3, ['dispatch_claim_stalled'])], actions: [action(4, 'repair_applied', 'owner')], now: at(5) },
  ]
  for (const item of terminal) {
    const pending = planRecoveryDrill({ drill, snapshots: item.snapshots, actions: item.actions, now: new Date(item.now), faultRolledBack: false })
    assert.equal(pending.step, 'rollback_fault', JSON.stringify(item.now))
    const done = planRecoveryDrill({ drill, snapshots: item.snapshots, actions: item.actions, now: new Date(item.now), faultRolledBack: true })
    assert.equal(done.step, 'complete')
  }
})

test('the plan walks detection, repair and resume while the drill is live', () => {
  const steps = [
    { minute: 2, snapshots: [snapshot(1, [])], actions: [] as RecoveryDrillAction[], expected: 'await_detection' },
    { minute: 4, snapshots: [snapshot(3, ['dispatch_claim_stalled'])], actions: [], expected: 'await_repair' },
    { minute: 8, snapshots: [snapshot(3, ['dispatch_claim_stalled'])], actions: [action(7, 'repair_applied')], expected: 'await_resume' },
  ]
  for (const step of steps) {
    const plan = planRecoveryDrill({ drill, snapshots: step.snapshots, actions: step.actions, now: new Date(at(step.minute)), faultRolledBack: false })
    assert.equal(plan.step, step.expected, `minute ${step.minute}`)
    assert.ok('secondsRemaining' in plan && plan.secondsRemaining > 0)
  }
})

test('an unbounded or malformed drill is refused before anything is injected', () => {
  const cases: Array<[Partial<RecoveryDrillRecord>, RegExp]> = [
    [{ drillId: '  ' }, /identity_missing/],
    [{ injectedRunId: '' }, /identity_missing/],
    [{ expiresAt: 'not-a-date' }, /window_invalid/],
    [{ expiresAt: at(0) }, /ttl_invalid/],
    [{ expiresAt: at(RECOVERY_DRILL_MAX_TTL_SECONDS / 60 + 1) }, /ttl_invalid/],
    [{ detectionDeadlineSeconds: 30 }, /detection_deadline_invalid/],
    [{ repairDeadlineSeconds: 300 }, /repair_deadline_invalid/],
    [{ detectionDeadlineSeconds: 600, repairDeadlineSeconds: 1200 }, /deadlines_exceed_ttl/],
  ]
  for (const [patch, expected] of cases) {
    assert.throws(() => assertRecoveryDrillBounded({ ...drill, ...patch }), expected, JSON.stringify(patch))
  }
  assert.doesNotThrow(() => assertRecoveryDrillBounded(drill))
})

test('the drill module performs no I/O and grants no authority', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityRecoveryDrill.ts', import.meta.url), 'utf8')
  const code = source.split('\n').filter((line: string) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n')
  for (const forbidden of ['cosServiceDb', 'fetch(', 'process.env', 'callLocalModel', 'authorized', 'approval']) {
    assert.ok(!code.includes(forbidden), `drill module must not reference ${forbidden}`)
  }
})
