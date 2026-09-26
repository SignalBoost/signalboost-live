import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const repair = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('RunPod v2 exact-artifact repair verifies materialized endpoint identity instead of persistent template linkage', () => {
  assert.match(repair, /one-time materialization/)
  assert.doesNotMatch(repair, /endpoint\.templateId/)
  assert.match(repair, /exactArtifactContainerImageFromEnv\(lane\) \|\| VLLM_IMAGE/)
  assert.match(repair, /endpoint\.image === expectedImage/)
  assert.match(repair, /args\.includes\(BASE_MODEL_REVISION\)/)
  assert.match(repair, /args\.includes\(input\.artifactRevision\)/)
  assert.match(repair, /args\.includes\(input\.artifactId\)/)
  assert.match(repair, /args\.includes\(modelName\)/)
  assert.match(repair, /args\.includes\('itmounts_mass_gateway\.py'\)/)
  assert.match(repair, /HEALTH_CHECK_PATH/)
  assert.match(repair, /PORT_HEALTH/)
})

test('repair remains fail-closed on cost and GPU policy around native v2 endpoint mutation', () => {
  assert.match(repair, /assertNonGpuEndpointSafetyPolicy\(endpoint, idleTimeoutSeconds\)/)
  assert.match(repair, /workers\?\.min/)
  assert.match(repair, /workers\?\.max/)
  assert.match(repair, /workers\?\.idleTimeout/)
  assert.match(repair, /gpu\?\.count/)
  assert.match(repair, /APPROVED_POOLS/)
  assert.match(repair, /nativeV2EndpointConfig/)
  assert.match(repair, /requestV2<Endpoint>\('\/serverless', \{/)
  assert.match(repair, /method: 'POST'/)
  assert.match(repair, /method: 'PATCH'/)
  assert.match(repair, /mass_distilled_runtime_materialized_identity_mismatch/)
})

test('native v2 provisioning is independent of the legacy v1 template index', () => {
  assert.doesNotMatch(repair, /provisionLegacyMassDistilledRuntime/)
  assert.doesNotMatch(repair, /includeEndpointBoundTemplates/)
  assert.match(repair, /nativeV2Inline: true/)
  assert.match(repair, /massDistilledRuntimeInlineContainer/)
  assert.match(route, /runpodMassDistilledProvisionV2/)
  assert.match(route, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true/)
})
