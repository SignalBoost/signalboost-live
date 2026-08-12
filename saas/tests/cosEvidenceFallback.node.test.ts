import assert from 'node:assert/strict'
import test from 'node:test'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'
import { selectEvidenceFallback } from '../lib/ai/cos/evidenceFallback.ts'

test('selects at most two second-stage capabilities', () => {
  const fallback = selectEvidenceFallback(PERFORMANCE_INCIDENT_RECIPE, ['metrics.query'])
  assert.ok(fallback)
  assert.equal(fallback?.id, 'self-healing.performance.v1.fallback')
  assert.ok((fallback?.steps.length ?? 0) <= 2)
})

test('does not retry a failed capability', () => {
  const fallback = selectEvidenceFallback(PERFORMANCE_INCIDENT_RECIPE, ['deployment.read'])
  assert.ok(fallback)
  assert.equal(fallback?.steps.some(step => step.capabilityId === 'deployment.read'), false)
})
