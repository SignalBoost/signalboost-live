import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryRecipeReuseStore, incidentRecipeReuseKey } from '../lib/ai/cos/recipeReuse.ts'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'

const incident = { incidentId: 'i1', provider: 'vercel', environment: 'production', severity: 'warning' as const, detectedAt: new Date().toISOString(), source: 'api' as const, errorMessage: 'API p95 latency increased', evidence: [], metadata: {} }

test('builds stable tenant-scoped incident signature', () => {
  assert.equal(incidentRecipeReuseKey('tenant-a', incident), 'tenant-a:production:vercel:performance')
  assert.notEqual(incidentRecipeReuseKey('tenant-a', incident), incidentRecipeReuseKey('tenant-b', incident))
})

test('stores and reuses a successful recipe by signature', () => {
  const store = createInMemoryRecipeReuseStore()
  const key = incidentRecipeReuseKey('tenant-a', incident)
  store.set(key, PERFORMANCE_INCIDENT_RECIPE)
  assert.equal(store.get(key)?.id, 'self-healing.performance.v1')
})
