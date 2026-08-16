import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { raceSemanticRetrievalWithBudget } from '../lib/ai/cos/semanticRetrievalBudget.ts'

test('completed semantic retrieval cancels its late timeout callback', async () => {
  let timeoutCalls = 0
  const result = await raceSemanticRetrievalWithBudget({
    work: Promise.resolve('semantic-result'),
    budgetMs: 10,
    fallback: 'lexical-fallback',
    onTimeout: () => { timeoutCalls += 1 },
  })

  assert.equal(result, 'semantic-result')
  await sleep(30)
  assert.equal(timeoutCalls, 0)
})

test('actual over-budget semantic retrieval still returns fallback and reports once', async () => {
  let timeoutCalls = 0
  const result = await raceSemanticRetrievalWithBudget({
    work: sleep(40).then(() => 'semantic-result'),
    budgetMs: 5,
    fallback: 'lexical-fallback',
    onTimeout: () => { timeoutCalls += 1 },
  })

  assert.equal(result, 'lexical-fallback')
  assert.equal(timeoutCalls, 1)
  await sleep(50)
  assert.equal(timeoutCalls, 1)
})
