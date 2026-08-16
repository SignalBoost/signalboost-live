// saas/tests/cosTurnBudget.node.test.ts
//
// Pins the rule that keeps a slow turn from being killed at the 300s platform ceiling: optional
// phases run while there is comfortably time and are skipped when there is not.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  startTurnBudget,
  remainingMs,
  hasBudgetFor,
  turnBudgetMs,
  localCallEstimateMs,
  challengeRoundEstimateMs,
} from '../lib/ai/cos/cosTurnBudget.ts'

test('budget never exceeds the platform ceiling minus reserved overhead', () => {
  assert.equal(turnBudgetMs(), 255_000) // 300s ceiling - 45s reserved
  process.env.COS_TURN_BUDGET_MS = '999999'
  assert.equal(turnBudgetMs(), 255_000, 'configuration must not restore the failure mode')
  delete process.env.COS_TURN_BUDGET_MS
})

test('a fresh turn can afford optional phases; an exhausted one cannot', () => {
  const start = 1_000_000
  const budget = startTurnBudget(start)
  assert.ok(hasBudgetFor(budget, localCallEstimateMs(), start), 'fresh turn affords a repair pass')
  assert.ok(hasBudgetFor(budget, challengeRoundEstimateMs(), start), 'fresh turn affords the challenge round')

  const nearDeadline = start + turnBudgetMs() - 5_000
  assert.equal(hasBudgetFor(budget, localCallEstimateMs(), nearDeadline), false, 'near deadline: skip optional work')
  assert.equal(hasBudgetFor(budget, challengeRoundEstimateMs(), nearDeadline), false)
})

test('remaining time floors at zero and never goes negative', () => {
  const start = 1_000_000
  const budget = startTurnBudget(start)
  assert.equal(remainingMs(budget, start + turnBudgetMs() + 60_000), 0)
})

test('the challenge round is estimated at two local calls because pairs run concurrently', () => {
  assert.equal(challengeRoundEstimateMs(), localCallEstimateMs() * 2)
})

test('estimates are configurable for different buyer hardware', () => {
  process.env.COS_LOCAL_CALL_ESTIMATE_MS = '20000'
  assert.equal(localCallEstimateMs(), 20_000)
  delete process.env.COS_LOCAL_CALL_ESTIMATE_MS
  assert.equal(localCallEstimateMs(), 75_000)
})
