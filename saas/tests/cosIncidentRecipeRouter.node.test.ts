import assert from 'node:assert/strict'
import test from 'node:test'
import { selectConnectorRecipe } from '../lib/ai/cos/incidentRecipeRouter.ts'

function incident(errorMessage: string) {
  return {
    incidentId: 'inc-1', provider: 'generic', environment: 'production', severity: 'warning' as const,
    detectedAt: new Date().toISOString(), source: 'api' as const, errorMessage,
    evidence: [{ evidenceId: 'e1', type: 'alert' as const, capturedAt: new Date().toISOString(), summary: errorMessage }], metadata: {},
  }
}

test('routes latency incidents to performance evidence', () => {
  assert.equal(selectConnectorRecipe(incident('API p95 latency tripled')).id, 'self-healing.performance.v1')
})

test('routes deployment failures to deployment evidence', () => {
  assert.equal(selectConnectorRecipe(incident('latest deployment failed after release')).id, 'self-healing.deployment.v1')
})

test('routes unhealthy service incidents to health evidence', () => {
  assert.equal(selectConnectorRecipe(incident('service health probe is degraded')).id, 'self-healing.health.v1')
})
