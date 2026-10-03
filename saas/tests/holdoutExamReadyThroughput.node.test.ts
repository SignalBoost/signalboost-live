//
// Production 2026-09-29 22:37-22:56 UTC: the evaluation lane reported `no_mass_artifact_with_holdout_exam_ready` on
// every tick while 6 of its 44 eligible artifacts already held a finished holdout exam. 157 exams were ready against
// 975 requested.
//
// Two orderings point opposite ways:
//   the lane picks candidates createdAt ASCENDING  (oldest first)
//   the exam writer fills sets  updated_at DESCENDING (newest first)
// so the candidates the lane inspects are systematically the least likely to have an exam yet, and with a window of 6
// the overlap can be empty for hours. Artifacts that passed every prerequisite sat in evaluation_pending for days
// behind a lane that could not see them.
//
// Both numbers here are scheduling only - no gate, ceiling, or approval rule changes - and these tests fail the build
// if either is narrowed back to a value that cannot survive the opposed ordering.
import assert from 'node:assert/strict'
import { lineCapacity } from '../lib/ai/cos/cosUniversityLineCapacity.ts'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const lane = read('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts')
const writer = read('../app/api/cron/cos-university-holdout-exam-items/route.ts')
const writerLib = read('../lib/ai/cos/cosUniversityHoldoutExamItems.ts')

test('the lane looks far enough ahead to reach an artifact whose exam is already written', () => {
  const match = lane.match(/const HOLDOUT_EXAM_LOOKAHEAD = (\d+)/)
  assert.ok(match, 'HOLDOUT_EXAM_LOOKAHEAD is no longer defined in the evaluation lane')
  const lookahead = Number(match[1])
  assert.ok(lookahead >= 24, `lookahead must stay >= 24 to survive an opposed writer ordering, got ${lookahead}`)
  assert.match(lane, /for \(let index = 0; index < HOLDOUT_EXAM_LOOKAHEAD; index \+= 1\) \{/)
})

test('the exam writer fills at the declared capacity, not at a baked-in ceiling', () => {
  // Owner 2026-10-03, "build a Ferrari not a Lada": the literal 10 pinned here was a rationing scheme for a
  // 10-worker RunPod account. Writing exam items spends small teacher calls and NO inference worker, so this station
  // never needed to be narrow, and a canary waiting on an exam set was that morning's line stop. The batch now comes
  // from the capacity the deployment declares, and must stay AHEAD of the canary.
  assert.match(writer, /fillRequestedHoldoutExamSets\(\{ db, limit: lineCapacity\(\)\.examSetsPerTick \}\)/,
    'the exam-items cron must size its batch from declared capacity')
  assert.doesNotMatch(writer, /fillRequestedHoldoutExamSets\(\{ db, limit: \d+ \}\)/,
    'a literal batch size is back')
  // The function's own bound is now only a runaway stop, not policy.
  assert.match(writerLib, /Math\.min\(EXAM_SET_FILL_MAX_PER_RUN, Math\.floor\(Number\(input\.limit\) \|\| 3\)\)/)
  const capacity = lineCapacity()
  assert.ok(capacity.examSetsPerTick >= 10, 'capacity must never ask for fewer sets than the old fixed ceiling')
  assert.ok(capacity.examSetsPerTick > capacity.canary,
    'the exam writer must stay ahead of the canary, or admission starves')
})

test('the wider window is a wider SEARCH, never more approvals', () => {
  // This is the assertion that makes the change safe. The loop collects candidates, but exactly ONE of them is
  // approved per tick, because the decision is a `.find` over the collected picks. If that ever becomes a
  // filter/map/forEach, a lookahead of 24 would quadruple the spend of a tick.
  assert.match(lane, /const decision = picks\.find\(pick => examReady\.some\(/)
  for (const spread of ['picks.filter(pick => examReady', 'picks.map(pick => examReady', 'for (const pick of picks)']) {
    assert.ok(!lane.includes(spread), `only one pick may be approved per tick, found ${spread}`)
  }
  // The in-flight ceiling still comes from the policy, and the lookahead must never be used as a budget.
  assert.match(lane, /inFlightCount,\n\s+maxInFlight,/)
  assert.ok(!/(maxInFlight|inFlightCount)\s*[:=]\s*HOLDOUT_EXAM_LOOKAHEAD/.test(lane),
    'the lookahead must never be used as a concurrency or approval budget')
  // The ready-exam requirement itself must survive: a wider window must not let an artifact be examined without one.
  assert.match(lane, /no_mass_artifact_with_holdout_exam_ready/)
})

test('the pick loop does not issue a database query per candidate', () => {
  // Widening 6 -> 24 multiplies whatever the loop body does. A per-candidate query inside it would turn a scheduling
  // fix into a timeout on a 300s cron.
  const start = lane.indexOf('for (let index = 0; index < HOLDOUT_EXAM_LOOKAHEAD; index += 1) {')
  const end = lane.indexOf('const examReady = await holdoutExamReadyArtifacts(', start)
  assert.ok(start > 0 && end > start, 'the pick loop or the readiness read moved')
  const body = lane.slice(start, end)
  for (const call of ['await db.from(', 'await cosServiceDb()', 'await holdoutExamReadyArtifacts(']) {
    assert.ok(!body.includes(call), `the pick loop must not query per candidate, found ${call}`)
  }
  // Readiness is read once for the whole batch, after the loop.
  assert.match(lane, /const examReady = await holdoutExamReadyArtifacts\(db, picks\.map\(pick => pick\.artifact\), now\)/)
})
