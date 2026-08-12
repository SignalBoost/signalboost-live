import assert from 'node:assert/strict'
import test from 'node:test'
import { selectLiveRecipe } from '../lib/ai/cos/liveRecipeSelection.ts'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'

const learned = Object.freeze({
  ...PERFORMANCE_INCIDENT_RECIPE,
  id: 'learned.performance.v1',
  steps: Object.freeze(PERFORMANCE_INCIDENT_RECIPE.steps.slice(0, 1)),
})

test('promoted reliable learned recipe wins live selection', () => {
  const selected = selectLiveRecipe(
    learned,
    PERFORMANCE_INCIDENT_RECIPE,
    { successes: 6, failures: 0, consecutiveFailures: 0, lastQuality: 0.95, promoted: true, updatedAt: Date.now() },
    0.75,
    false,
  )
  assert.equal(selected.source, 'learned')
  assert.equal(selected.recipe.id, 'learned.performance.v1')
  assert.ok(selected.optimizationScore > 0)
})

test('degraded learned recipe yields to deterministic route', () => {
  const selected = selectLiveRecipe(
    learned,
    PERFORMANCE_INCIDENT_RECIPE,
    { successes: 0, failures: 4, consecutiveFailures: 1, lastQuality: 0.1, promoted: false, updatedAt: Date.now() },
    0.75,
    false,
  )
  assert.equal(selected.source, 'deterministic')
  assert.equal(selected.recipe.id, PERFORMANCE_INCIDENT_RECIPE.id)
})

test('cooldown blocks learned recipe regardless of historical quality', () => {
  const selected = selectLiveRecipe(
    learned,
    PERFORMANCE_INCIDENT_RECIPE,
    { successes: 20, failures: 2, consecutiveFailures: 2, lastQuality: 1, promoted: true, cooldownUntil: Date.now() + 60_000, updatedAt: Date.now() },
    0.75,
    true,
  )
  assert.equal(selected.source, 'deterministic')
})
