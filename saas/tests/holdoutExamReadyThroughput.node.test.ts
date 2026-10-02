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

test('the exam writer fills at its own ceiling so the queue can actually drain', () => {
  const match = writer.match(/fillRequestedHoldoutExamSets\(\{ db, limit: (\d+) \}\)/)
  assert.ok(match, 'the exam-items cron no longer calls fillRequestedHoldoutExamSets with a literal limit')
  assert.equal(Number(match[1]), 10, 'the writer must request the function ceiling of 10 sets per tick')
  // 10 is the function's OWN cap, so this raises no limit anywhere - it stops under-asking.
  assert.match(writerLib, /Math\.max\(1, Math\.min\(10, Math\.floor\(Number\(input\.limit\) \|\| 3\)\)\)/)
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
// end of saas/tests/holdoutExamReadyThroughput.node.test.ts (if this line is missing, the paste was cut short)