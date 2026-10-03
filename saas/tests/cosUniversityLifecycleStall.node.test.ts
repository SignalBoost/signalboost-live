// saas/tests/cosUniversityLifecycleStall.node.test.ts
//
// Owner 2026-10-02: "if exist, it is not orchestrating very well." The distillation supervisor runs every 5 minutes
// and remediates, but every reason it can raise is upstream of the artifact existing. Four downstream parkings ran for
// DAYS behind a green heartbeat: the exam lane idle on no_mass_artifact_with_holdout_exam_ready, 11 students held in
// quarantine, registration starving its oldest artifact, and passing artifacts waiting at runtime_pending.
//
// These tests hold the new watcher to the two properties that make it safe to act on: an empty stage is never a
// stall, and a stage holding work that has moved nobody for longer than its own cadence always is.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIFECYCLE_STAGE_GRACE_SECONDS,
  LIFECYCLE_STALL_REASONS,
  decideUniversityLifecycleStalls,
  type LifecycleStageId,
  type LifecycleStageReading,
} from '../lib/ai/cos/cosUniversityLifecycleStall.ts'

const NOW = new Date('2026-10-02T20:00:00.000Z')
const agoSeconds = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()
const STAGES: LifecycleStageId[] = ['exam', 'quarantine', 'registration', 'activation']

const reading = (over: Partial<LifecycleStageReading> & { stage: LifecycleStageId }): LifecycleStageReading => ({
  waiting: 5,
  lastTransitionAt: agoSeconds(60),
  oldestWaitingSince: agoSeconds(120),
  ...over,
})

test('an empty stage is never a stall, however long it has been quiet', () => {
  // The single most important property. A drained queue is the pipeline working; reporting it would train
  // everyone to ignore the alarm.
  for (const stage of STAGES) {
    const stalls = decideUniversityLifecycleStalls({
      stages: [reading({ stage, waiting: 0, lastTransitionAt: agoSeconds(400 * 60), oldestWaitingSince: null })],
      now: NOW,
    })
    assert.deepEqual(stalls, [], `${stage} with no work must stay silent`)
  }
})

test('a stage holding work that has moved nobody past its grace is reported', () => {
  for (const stage of STAGES) {
    const grace = LIFECYCLE_STAGE_GRACE_SECONDS[stage]
    const stalls = decideUniversityLifecycleStalls({
      stages: [reading({ stage, waiting: 7, lastTransitionAt: agoSeconds(grace + 60) })],
      now: NOW,
    })
    assert.equal(stalls.length, 1, `${stage} holding work and not moving must be reported`)
    assert.equal(stalls[0].stage, stage)
    assert.equal(stalls[0].waiting, 7)
    assert.equal(stalls[0].graceSeconds, grace)
    assert.ok(stalls[0].idleSeconds > grace)
    assert.ok(LIFECYCLE_STALL_REASONS.includes(stalls[0].reason))
  }
})

test('a stage still inside its grace is not reported, so one slow tick is not an incident', () => {
  for (const stage of STAGES) {
    const grace = LIFECYCLE_STAGE_GRACE_SECONDS[stage]
    for (const idle of [0, 60, grace - 1, grace]) {
      const stalls = decideUniversityLifecycleStalls({
        stages: [reading({ stage, lastTransitionAt: agoSeconds(idle) })],
        now: NOW,
      })
      assert.deepEqual(stalls, [], `${stage} must tolerate ${idle}s of quiet within a grace of ${grace}s`)
    }
  }
})

test('a lane that was born broken is caught by its oldest waiting student', () => {
  // No transition has EVER happened, so there is no movement clock. Falling back to the oldest arrival is what
  // catches a stage that never worked, instead of excusing it for lack of evidence.
  const stalls = decideUniversityLifecycleStalls({
    stages: [reading({
      stage: 'exam',
      waiting: 7,
      lastTransitionAt: null,
      oldestWaitingSince: agoSeconds(LIFECYCLE_STAGE_GRACE_SECONDS.exam + 3600),
    })],
    now: NOW,
  })
  assert.equal(stalls.length, 1)
  assert.equal(stalls[0].reason, 'lifecycle_exam_stalled')
})

test('an unreadable or future clock reports nothing rather than inventing a stall', () => {
  // Fail quiet, not loud: a broken timestamp is a reason to look, never evidence the pipeline stopped. A future
  // timestamp is clock skew between the database and the runtime.
  for (const [lastTransitionAt, oldestWaitingSince] of [
    [null, null],
    ['not-a-date', 'also-not-a-date'],
    ['', ''],
    [new Date(NOW.getTime() + 86_400_000).toISOString(), null],
  ] as Array<[string | null, string | null]>) {
    const stalls = decideUniversityLifecycleStalls({
      stages: [reading({ stage: 'quarantine', waiting: 9, lastTransitionAt, oldestWaitingSince })],
      now: NOW,
    })
    assert.deepEqual(stalls, [], `clock ${String(lastTransitionAt)} must not produce a stall`)
  }
  // An unusable `now` cannot produce findings either.
  assert.deepEqual(decideUniversityLifecycleStalls({ stages: [reading({ stage: 'exam' })], now: new Date('nope') }), [])
})

test('every stage is independent, and all four can be reported together', () => {
  // The Production shape: several stages parked at once. One stage reporting must never mask another.
  const stalls = decideUniversityLifecycleStalls({
    stages: STAGES.map(stage => reading({
      stage,
      waiting: 3,
      lastTransitionAt: agoSeconds(LIFECYCLE_STAGE_GRACE_SECONDS[stage] + 600),
    })),
    now: NOW,
  })
  assert.equal(stalls.length, 4)
  assert.deepEqual(stalls.map(stall => stall.stage).sort(), [...STAGES].sort())
  assert.deepEqual([...new Set(stalls.map(stall => stall.reason))].sort(), [...LIFECYCLE_STALL_REASONS].sort())
})

test('the watcher cannot judge a student, only report that a stage is not moving', () => {
  // It must stay an observation. Nothing it returns may carry a grade, a verdict or an authority.
  const stalls = decideUniversityLifecycleStalls({
    stages: [reading({ stage: 'registration', lastTransitionAt: agoSeconds(99 * 3600) })],
    now: NOW,
  })
  assert.deepEqual(Object.keys(stalls[0]).sort(), ['graceSeconds', 'idleSeconds', 'reason', 'stage', 'waiting'])
  assert.ok(Object.isFrozen(stalls))
  assert.ok(Object.isFrozen(stalls[0]))
})

test('an unknown stage is ignored rather than defaulting to some grace', () => {
  const stalls = decideUniversityLifecycleStalls({
    stages: [{ stage: 'not_a_stage' as LifecycleStageId, waiting: 50, lastTransitionAt: agoSeconds(99 * 3600), oldestWaitingSince: null }],
    now: NOW,
  })
  assert.deepEqual(stalls, [])
})
// end of saas/tests/cosUniversityLifecycleStall.node.test.ts (if this line is missing, the paste was cut short)
