import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryRecipeReuseStore, scoreRecipeEvidence } from '../lib/ai/cos/recipeReuse.ts'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'

test('scores connector evidence by successful calls', () => {
  const score = scoreRecipeEvidence({ ok: true, mode: 'delegated', missingRequired: [], evidence: [
    { capabilityId: 'metrics.query', result: { ok: true, providerId: 'metrics', capabilityId: 'metrics.query', data: {} } },
    { capabilityId: 'logs.search', result: { ok: false, providerId: 'logs', capabilityId: 'logs.search', error: 'timeout' } },
  ] })
  assert.equal(score, 0.5)
})

test('scores unusable evidence as zero', () => {
  assert.equal(scoreRecipeEvidence({ ok: false, mode: 'capability_unavailable', missingRequired: ['metrics.query'], evidence: [] }), 0)
})

test('expires stale in-memory recipes', async () => {
  let now = 1_000
  const store = createInMemoryRecipeReuseStore({ maxAgeMs: 100, now: () => now })
  await store.set('k', PERFORMANCE_INCIDENT_RECIPE)
  assert.equal((await store.get('k'))?.id, PERFORMANCE_INCIDENT_RECIPE.id)
  now = 1_101
  assert.equal(await store.get('k'), undefined)
})
