// saas/tests/cosUniversityMassEvaluationRuntimeWake.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('mass evaluation wakes the scaled-to-zero runtime through the vLLM load-balancer path', () => {
  // Production 2026-09-17 19:32 UTC: GET /v1/models returned 404 because the exact-artifact gateway serves only
  // /ping, /ready and POST /v1/chat/completions. The wake uses a path the runtime actually serves.
  assert.match(route, /runpodServerlessRootUrl\(endpointId\)\}\/ping`/)
  assert.doesNotMatch(route, /\/models`/)
  assert.match(route, /!== 'accepting_requests'/)
  const gateway = fs.readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
  assert.match(gateway, /@app\.get\('\/ping'\)/)
  assert.doesNotMatch(gateway, /@app\.get\('\/v1\/models'\)/)
  assert.match(route, /tokenGeneratingRequest: false/)
  assert.match(route, /await wakeMassDistilledRuntime\(claim\.endpointId, deadlineMs\)/)
})

test('runtime wake remains separate from the approved scoring-call budget', () => {
  const wake = route.indexOf('await wakeMassDistilledRuntime(claim.endpointId, deadlineMs)')
  const evaluation = route.indexOf('await runMassDistilledArtifactEvaluation({ claim, deadlineMs, now: new Date() })')
  assert.ok(wake >= 0 && evaluation > wake)
  assert.match(route, /does not consume one of the\n    \/\/ eight approved scoring calls/)
})
