// saas/tests/runpodMassDistilled24GbPolicy.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const deployRoute = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const evaluationRoute = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('mass-distilled evaluator runtime narrows provider preflight to AMPERE_24 only', () => {
  assert.match(provisionV2, /const APPROVED_POOLS = \['AMPERE_24'\] as const/)
  assert.doesNotMatch(provisionV2, /APPROVED_POOLS = \['AMPERE_16', 'AMPERE_24'\] as const/)
  assert.match(provisionV2, /constrainEndpointToApprovedGpu/)
  assert.match(provisionV2, /body: JSON\.stringify\(\{ gpu: \{ pools: \[\.\.\.APPROVED_POOLS\], count: 1 \} \}\)/)
})

test('24GB narrowing remains provider preflight before the paid canary invocation marker', () => {
  const provisionIndex = deployRoute.indexOf('provisionMassDistilledRuntime(runtimeArtifact)')
  const invocationIndex = deployRoute.indexOf('claim:INVOCATION_STARTED')
  assert.ok(provisionIndex >= 0)
  assert.ok(invocationIndex > provisionIndex)
  assert.match(provisionV2, /const provisioned = await provisionLegacyMassDistilledRuntime\(input\)/)
  assert.match(provisionV2, /await constrainEndpointToApprovedGpu\(String\(provisioned\.endpointId\)\)/)
})

test('independent evaluator reasserts 24GB endpoint policy before readiness or inference', () => {
  assert.match(provisionV2, /export async function ensureMassDistilledEndpoint24Gb\(endpointId: string\)/)
  const preflightIndex = evaluationRoute.indexOf('ensureMassDistilledEndpoint24Gb(claim.endpointId)')
  const evaluationIndex = evaluationRoute.indexOf('runMassDistilledArtifactEvaluation({ claim, deadlineMs')
  assert.ok(preflightIndex >= 0)
  assert.ok(evaluationIndex > preflightIndex)
  assert.match(evaluationRoute, /cos-mass-distilled-runtime-preflight/)
})

test('24GB repair preserves one-worker and scale-to-zero safety validation', () => {
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.min \?\? Number\.NaN\) !== 0/)
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.max \?\? Number\.NaN\) > 1/)
  assert.match(provisionV2, /Number\(endpoint\.gpu\?\.count \?\? Number\.NaN\) !== 1/)
})

test('evaluation restores the one worker a retired endpoint is allowed, before it probes readiness', () => {
  const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
  // Production 2026-09-17 19:04 and 19:14 UTC: mass:481a6760 passed its canary at 17:27, a later canary retired its
  // endpoint to max 0 workers, and evaluation then failed with runtime_not_ready:network.
  assert.match(provisionV2, /async function restoreRetiredEndpointCapacity\(endpoint: Endpoint\)/)
  assert.match(provisionV2, /if \(Number\(endpoint\.workers\?\.max \?\? Number\.NaN\) >= 1\) return endpoint/)
  assert.match(provisionV2, /body: JSON\.stringify\(\{ workers: \{ min: 0, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS \} \}\)/)
  assert.match(provisionV2, /mass_distilled_runtime_capacity_restore_rejected/)
  assert.match(provisionV2, /const endpoint = await restoreRetiredEndpointCapacity\(await constrainEndpointToApprovedGpu/)
  // The restore never widens the endpoint policy: one worker, scale to zero, unchanged idle timeout.
  assert.doesNotMatch(provisionV2, /max: [2-9]|min: [1-9]/)
})
