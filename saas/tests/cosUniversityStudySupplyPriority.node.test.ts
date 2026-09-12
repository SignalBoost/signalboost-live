// saas/tests/cosUniversityStudySupplyPriority.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_BARREN_STREAK_THRESHOLD,
  barrenStreak,
  orderStudyPlansBySupply,
  planBarrenStreak,
  studyGapHistoryFromDiagnostics,
} from '../lib/ai/cos/cosUniversityStudySupplyPriority.ts'

const CS = 'auto-gap:university:0b268e3dd437ddcbce0b4d71fd8b6463a6c2d590c6e9e85ee7a1c5fa574e7259:cos_university.computer_science'
const STATS = 'auto-gap:university:47592df430aae725cce4125d90f97397d1774e8c982983956e19067aca939564:cos_university.statistics_data_science'

/** Newest first, as the loader reads them. Shapes copied from production gap_diagnostics. */
const productionRuns = [
  { [CS]: { documentsAcquired: 11, accepted: 0 }, [STATS]: { documentsAcquired: 11, accepted: 0 } },
  { [CS]: { documentsAcquired: 11, accepted: 0 }, [STATS]: { documentsAcquired: 11, accepted: 0 } },
  { [CS]: { documentsAcquired: 11, accepted: 0 }, [STATS]: { documentsAcquired: 11, accepted: 0 } },
  { [CS]: { documentsAcquired: 11, accepted: 0 }, [STATS]: { documentsAcquired: 13, accepted: 3 } },
  { [CS]: { documentsAcquired: 11, accepted: 0 } },
]

test('a gap that keeps acquiring and accepting nothing accumulates a barren streak', () => {
  const history = studyGapHistoryFromDiagnostics(productionRuns)
  assert.equal(planBarrenStreak('0b268e3dd437ddcbce0b4d71fd8b6463a6c2d590c6e9e85ee7a1c5fa574e7259', history), 5)
})

test('an acceptance breaks the streak, so a gap that recently yielded is not treated as exhausted', () => {
  const history = studyGapHistoryFromDiagnostics(productionRuns)
  assert.equal(planBarrenStreak('47592df430aae725cce4125d90f97397d1774e8c982983956e19067aca939564', history), 3)
})

test('a source outage is not an exhausted pool', () => {
  // Acquiring zero documents means the adapters failed, not that the material was judged and refused.
  assert.equal(barrenStreak([
    { documentsAcquired: 0, accepted: 0 },
    { documentsAcquired: 0, accepted: 0 },
    { documentsAcquired: 0, accepted: 0 },
    { documentsAcquired: 0, accepted: 0 },
  ]), 0)
})

test('exhausted plans move behind productive ones without being dropped', () => {
  const history = studyGapHistoryFromDiagnostics(productionRuns)
  const plans = [
    { planKey: '0b268e3dd437ddcbce0b4d71fd8b6463a6c2d590c6e9e85ee7a1c5fa574e7259', id: 'cs' },
    { planKey: '47592df430aae725cce4125d90f97397d1774e8c982983956e19067aca939564', id: 'stats' },
    { planKey: 'never-seen-before-plan-key', id: 'fresh' },
  ]
  const ordered = orderStudyPlansBySupply(plans, history)
  assert.deepEqual(ordered.map(plan => plan.id), ['stats', 'fresh', 'cs'])
  assert.equal(ordered.length, plans.length, 'no plan is ever removed')
})

test('with no history, and when every plan is barren, the original order is preserved exactly', () => {
  const plans = [{ planKey: 'a' }, { planKey: 'b' }, { planKey: 'c' }]
  assert.deepEqual(orderStudyPlansBySupply(plans, studyGapHistoryFromDiagnostics([])), plans)

  const allBarren = studyGapHistoryFromDiagnostics(
    Array.from({ length: DEFAULT_BARREN_STREAK_THRESHOLD }, () => ({
      'auto-gap:university:a:x': { documentsAcquired: 9, accepted: 0 },
      'auto-gap:university:b:x': { documentsAcquired: 9, accepted: 0 },
      'auto-gap:university:c:x': { documentsAcquired: 9, accepted: 0 },
    })),
  )
  assert.deepEqual(orderStudyPlansBySupply(plans, allBarren), plans)
})

test('malformed or partial diagnostics never invent a streak', () => {
  const history = studyGapHistoryFromDiagnostics([
    null,
    'not an object',
    { 'auto-gap:university:a:x': { accepted: 0 } },
    { 'auto-gap:university:a:x': { documentsAcquired: 'eleven', accepted: 0 } },
  ])
  assert.equal(planBarrenStreak('a', history), 0)
  assert.equal(planBarrenStreak('', history), 0)
})
