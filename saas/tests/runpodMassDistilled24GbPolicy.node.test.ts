import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const deployRoute = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('mass-distilled evaluator runtime narrows provider preflight to AMPERE_24 only', () => {
  assert.match(provisionV2, /const APPROVED_POOLS = \['AMPERE_24'\] as const/)
  assert.doesNotMatch(provisionV2, /const APPROVED_POOLS = \['AMPERE_16', 'AMPERE_24'\] as const/)
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

test('24GB repair preserves one-worker and scale-to-zero safety validation', () => {
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.min \?\? Number\.NaN\) !== 0/)
  assert.match(provisionV2, /Number\(endpoint\.workers\?\.max \?\? Number\.NaN\) > 1/)
  assert.match(provisionV2, /Number\(endpoint\.gpu\?\.count \?\? Number\.NaN\) !== 1/)
})
