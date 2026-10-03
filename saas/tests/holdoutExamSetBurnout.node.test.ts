//
// Owner, 2026-10-03: "the pipeline still not working - the artifacts are not moving downstream and continuously."
//
// Production that morning: 237 mass artifacts at `evaluation_ready`, ZERO at `evaluation_pending`, zero admitted in
// 24 hours, 16 graduates `active` with no movement. Training was alive (11 new artifacts in 6 hours) and the canary
// was approving deploys (6 in the same window). The head of the line was the exam-set writer, and the gate was:
//
//     .lt('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS)      // max = 3
//
// Admission requires an exam set at `status = 'ready'`. Every failure incremented `attempts`, and at 3 the set became
// invisible to the writer FOREVER - so its artifact could never be admitted and sat at `evaluation_ready` for good.
// Two of the failures that spent that budget were not about the artifact at all: `no_active_mass_teacher` and
// `hf_token_missing` are read once per run and true for the whole batch, so a brief outage marked 10 sets failed per
// tick, 6 ticks an hour, and permanently disqualified the entire population.
//
// These tests fail the build if an attempt is ever charged for a fault that is not the set's own, if an exhausted set
// becomes unrecoverable again, or if the lane goes back to reporting a line stop as though it were an idle queue.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EXAM_SET_GLOBAL_PRECONDITIONS,
  EXAM_SET_RECOVERY_COOLOFF_MS,
  EXAM_SET_RECOVERY_MAX_PER_RUN,
  EXAM_SET_STRUCTURAL_FAILURES,
  classifyExamSetFailure,
  decideExamSetRecovery,
  describeExamSetPopulation,
  shouldAbortRun,
  shouldChargeAttempt,
} from '../lib/ai/cos/cosUniversityHoldoutExamSetRecovery.ts'
import { HOLDOUT_EXAM_MAX_SET_ATTEMPTS } from '../lib/ai/cos/cosUniversityHoldoutExamItems.ts'

const NOW = new Date('2026-10-03T14:30:00.000Z')
const agoMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const candidate = (over: Partial<Parameters<typeof decideExamSetRecovery>[0]['sets'][number]> = {}) => ({
  candidateId: 'mass:aaaa1111',
  artifactHash: 'a'.repeat(64),
  attempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  lastError: 'exam_items_incomplete:3/12',
  updatedAt: agoMs(EXAM_SET_RECOVERY_COOLOFF_MS + 60_000),
  ...over,
})

test('a deployment-wide precondition never charges a set and stops the whole run', () => {
  // The defect that stopped the line. These are read once per run and true for every set in the batch, so charging
  // them to individual sets disqualifies the entire population for something none of them did.
  for (const reason of EXAM_SET_GLOBAL_PRECONDITIONS) {
    assert.equal(classifyExamSetFailure(reason), 'global_precondition', reason)
    assert.equal(shouldChargeAttempt(reason), false, `${reason} must not spend a set's budget`)
    assert.equal(shouldAbortRun(reason), true, `${reason} must stop the run`)
  }
  assert.deepEqual([...EXAM_SET_GLOBAL_PRECONDITIONS], ['no_active_mass_teacher', 'hf_token_missing'])
})

test('a passing provider fault never charges a set either', () => {
  // A rate limit, a timeout, a model returning prose instead of JSON. Our fault, so the student does not pay for it.
  for (const reason of [
    'exam_items_incomplete:3/12',
    'exam_items_incomplete:12/12',
    'fetch failed',
    'HTTP 429 Too Many Requests',
    'The operation was aborted due to timeout',
    'socket hang up',
  ]) {
    assert.equal(classifyExamSetFailure(reason), 'transient', reason)
    assert.equal(shouldChargeAttempt(reason), false, `${reason} must not spend a set's budget`)
    assert.equal(shouldAbortRun(reason), false, `${reason} must not stop the run`)
  }
})

test('only a set whose own pinned data cannot produce an exam spends its budget', () => {
  for (const reason of EXAM_SET_STRUCTURAL_FAILURES) {
    assert.equal(classifyExamSetFailure(reason), 'structural', reason)
    assert.equal(shouldChargeAttempt(reason), true, `${reason} is durable and must spend the budget`)
    assert.equal(shouldAbortRun(reason), false)
  }
  assert.deepEqual([...EXAM_SET_STRUCTURAL_FAILURES],
    ['mass_run_binding_missing', 'holdout_ref_invalid', 'holdout_count_invalid', 'holdout_item_hash_invalid'])
})

test('an unknown reason is treated as recoverable, because the two mistakes do not cost the same', () => {
  // Treating a transient fault as structural removes an artifact from the line forever. Treating a structural fault
  // as transient costs a few retries that keep failing visibly. Prefer the recoverable error.
  for (const reason of ['', null, undefined, 'something_nobody_has_seen_before', '   ']) {
    assert.equal(classifyExamSetFailure(reason), 'transient', String(reason))
    assert.equal(shouldChargeAttempt(reason), false)
  }
})

test('an exhausted set gets its budget back once it has cooled off', () => {
  const [decision, ...rest] = decideExamSetRecovery({
    sets: [candidate()],
    now: NOW,
    maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  })
  assert.deepEqual(rest, [])
  assert.ok(decision)
  assert.equal(decision.candidateId, 'mass:aaaa1111')
  assert.equal(decision.reason, 'exhausted_by_transient_failure')
  assert.equal(decision.previousAttempts, HOLDOUT_EXAM_MAX_SET_ATTEMPTS)
  assert.equal(decision.authorityExpanded, false)
})

test('a population burned out by a global precondition is revived and says so', () => {
  const decisions = decideExamSetRecovery({
    sets: EXAM_SET_GLOBAL_PRECONDITIONS.map((reason, index) => candidate({
      candidateId: `mass:bbbb${index}`,
      lastError: reason,
    })),
    now: NOW,
    maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  })
  assert.equal(decisions.length, EXAM_SET_GLOBAL_PRECONDITIONS.length)
  for (const decision of decisions) assert.equal(decision.reason, 'exhausted_by_global_precondition')
})

test('a set whose holdout data is malformed stays exhausted rather than burning teacher calls', () => {
  // Retrying cannot help, so reviving it would spend money on nothing. It is reported in the population instead.
  for (const reason of EXAM_SET_STRUCTURAL_FAILURES) {
    assert.deepEqual(decideExamSetRecovery({
      sets: [candidate({ lastError: reason })],
      now: NOW,
      maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
    }), [], `${reason} must not be revived`)
  }
})

test('a set still inside its budget is left alone, and a set inside its cool-off waits', () => {
  assert.deepEqual(decideExamSetRecovery({
    sets: [candidate({ attempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS - 1 })],
    now: NOW,
    maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  }), [], 'the writer will pick this one up normally')

  for (const quiet of [0, 60_000, EXAM_SET_RECOVERY_COOLOFF_MS - 1]) {
    assert.deepEqual(decideExamSetRecovery({
      sets: [candidate({ updatedAt: agoMs(quiet) })],
      now: NOW,
      maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
    }), [], `a set quiet for ${quiet}ms is still cooling off`)
  }
})

test('an unreadable clock revives nothing rather than reviving everything', () => {
  for (const updatedAt of [null, '', 'not-a-date']) {
    assert.deepEqual(decideExamSetRecovery({
      sets: [candidate({ updatedAt })],
      now: NOW,
      maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
    }), [], `clock ${String(updatedAt)} must not trigger a revival`)
  }
  assert.deepEqual(decideExamSetRecovery({
    sets: [candidate()],
    now: new Date('nope'),
    maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  }), [])
})

test('a revival is bounded, so a recovery can never become a stampede', () => {
  const many = Array.from({ length: EXAM_SET_RECOVERY_MAX_PER_RUN * 3 }, (_unused, index) =>
    candidate({ candidateId: `mass:cccc${index}` }))
  assert.equal(decideExamSetRecovery({ sets: many, now: NOW, maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS }).length,
    EXAM_SET_RECOVERY_MAX_PER_RUN)
  assert.equal(decideExamSetRecovery({ sets: many, now: NOW, maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS, maxPerRun: 5 }).length, 5)
})

test('a set with no identity is skipped rather than guessed at', () => {
  assert.deepEqual(decideExamSetRecovery({
    sets: [candidate({ candidateId: '' }), candidate({ artifactHash: '' })],
    now: NOW,
    maxAttempts: HOLDOUT_EXAM_MAX_SET_ATTEMPTS,
  }), [])
})

test('a stalled exam lane says it is a line stop, not an idle queue', () => {
  // `no_mass_artifact_with_holdout_exam_ready` reads like "nothing to do". With 237 artifacts waiting and every
  // candidate disqualified, that reading cost a day.
  assert.match(describeExamSetPopulation({ requested: 0, failed: 0, ready: 0, exhausted: 237 }), /^LINE STOP:/)
  assert.match(describeExamSetPopulation({ requested: 12, failed: 3, ready: 0, exhausted: 0 }), /no exam set ready yet/)
  assert.match(describeExamSetPopulation({ requested: 5, failed: 0, ready: 9, exhausted: 2 }), /ready=9/)
  assert.match(describeExamSetPopulation({ requested: 0, failed: 0, ready: 0, exhausted: 0 }), /no exam sets exist yet/)
})

test('the live writer aborts on a precondition instead of charging the batch', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityHoldoutExamItems.ts', import.meta.url), 'utf8')
  // The precondition is decided ONCE, before the per-set loop, and returns.
  assert.match(source, /const abortReason = !teachers\.length/)
  assert.match(source, /aborted: abortReason/)
  // The dead per-set guards that charged the whole batch must not come back.
  assert.doesNotMatch(source, /await fail\('no_active_mass_teacher'\)/)
  assert.doesNotMatch(source, /await fail\('hf_token_missing'\)/)
  // Only a structural failure spends the budget, and a transient one is backed off instead of starving the queue.
  assert.match(source, /const charged = shouldChargeAttempt\(reason\)/)
  assert.match(source, /attempts: charged \? attempts \+ 1 : attempts,/)
  assert.match(source, /status: charged \? 'failed' : 'requested',/)
  assert.match(source, /TRANSIENT_BACKOFF_MS/)
  // The exhausted population is revived and reported on every run.
  assert.match(source, /const revived = await reviveExhaustedExamSets\(\{ db, now \}\)/)
  assert.match(source, /\.gte\('attempts', HOLDOUT_EXAM_MAX_SET_ATTEMPTS\)/)
  // The writer still only ever prepares exams; it must not grade, admit or promote anything.
  assert.doesNotMatch(source, /status: 'evaluation_pending'/)
  assert.doesNotMatch(source, /productionTrafficAuthorized: true/)
})

test('the writer cron makes a dead head-of-line station loud instead of answering ok', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-holdout-exam-items/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(result\.aborted\) \{/)
  assert.match(route, /\{ status: 503 \}/)
  assert.match(route, /invocationSucceeded: !result\.aborted/)
  assert.match(route, /describeExamSetPopulation/)
  assert.match(route, /population: result\.population/)
  assert.match(route, /revived: result\.revived/)
})
