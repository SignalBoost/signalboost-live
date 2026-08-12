import assert from 'node:assert/strict'
import test from 'node:test'
import { rankRecipeCandidates, selectOptimizedRecipe } from '../lib/ai/cos/recipeOptimization'

test('prefers reliable efficient recipe over slower noisy alternative', () => {
  const ranked = rankRecipeCandidates([
    { id: 'slow', quality: 0.9, successes: 8, failures: 2, averageLatencyMs: 5000, capabilityCalls: 7 },
    { id: 'fast', quality: 0.88, successes: 9, failures: 1, averageLatencyMs: 500, capabilityCalls: 3, promoted: true },
  ])
  assert.equal(ranked[0]?.id, 'fast')
})

test('excludes cooling-down recipes from selection', () => {
  const selected = selectOptimizedRecipe([
    { id: 'cooling', quality: 1, successes: 20, failures: 0, coolingDown: true },
    { id: 'healthy', quality: 0.7, successes: 3, failures: 1 },
  ])
  assert.equal(selected?.id, 'healthy')
})

test('ranking is deterministic on equal scores', () => {
  const ranked = rankRecipeCandidates([
    { id: 'b', quality: 0.8, successes: 2, failures: 0 },
    { id: 'a', quality: 0.8, successes: 2, failures: 0 },
  ])
  assert.deepEqual(ranked.map(item => item.id), ['a', 'b'])
})
