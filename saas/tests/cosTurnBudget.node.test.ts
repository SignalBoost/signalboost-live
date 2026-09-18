// saas/tests/cosTurnBudget.node.test.ts
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

test('interactive COS defaults to a 45-second wall-clock budget', () => {
  assert.equal(turnBudgetMs(), 45_000)
  process.env.COS_TURN_BUDGET_MS = '999999'
  assert.equal(turnBudgetMs(), 255_000, 'configuration still cannot exceed platform ceiling minus overhead')
  delete process.env.COS_TURN_BUDGET_MS
})

test('default interactive budget skips expensive optional phases so the draft can run', () => {
  const start = 1_000_000
  const budget = startTurnBudget(start)
  assert.equal(hasBudgetFor(budget, localCallEstimateMs(), start), false)
  assert.equal(hasBudgetFor(budget, challengeRoundEstimateMs(), start), false)
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
