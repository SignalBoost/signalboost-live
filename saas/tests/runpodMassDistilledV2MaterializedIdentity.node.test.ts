import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const repair = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('RunPod v2 exact-artifact repair verifies materialized endpoint identity instead of persistent template linkage', () => {
  assert.match(repair, /one-time materialization/)
  assert.doesNotMatch(repair, /endpoint\.templateId/)
  assert.match(repair, /endpoint\.image === VLLM_IMAGE/)
  assert.match(repair, /args\.includes\(BASE_MODEL_REVISION\)/)
  assert.match(repair, /args\.includes\(input\.artifactRevision\)/)
  assert.match(repair, /args\.includes\(input\.artifactId\)/)
  assert.match(repair, /args\.includes\(modelName\)/)
  assert.match(repair, /args\.includes\('itmounts_mass_gateway\.py'\)/)
  assert.match(repair, /HEALTH_CHECK_PATH/)
  assert.match(repair, /PORT_HEALTH/)
})

test('repair remains fail-closed on cost and GPU policy before any v2 endpoint mutation', () => {
  const safetyIndex = repair.indexOf('assertEndpointSafetyPolicy(endpoint)')
  const patchIndex = repair.indexOf("method: 'PATCH'")
  assert.ok(safetyIndex >= 0 && patchIndex > safetyIndex)
  assert.match(repair, /workers\?\.min/)
  assert.match(repair, /workers\?\.max/)
  assert.match(repair, /workers\?\.idleTimeout/)
  assert.match(repair, /gpu\?\.count/)
  assert.match(repair, /APPROVED_POOLS/)
  assert.match(repair, /\/serverless\/\$\{encodeURIComponent\(endpoint\.id\)\}/)
  assert.match(repair, /JSON\.stringify\(\{ templateId: template\.id \}\)/)
  assert.match(repair, /mass_distilled_runtime_materialized_identity_mismatch/)
})

test('legacy creator is preserved and only the obsolete template-link mismatch enters compatibility repair', () => {
  assert.match(repair, /provisionLegacyMassDistilledRuntime/)
  assert.match(repair, /mass_distilled_runtime_endpoint_template_mismatch/)
  assert.match(repair, /mass_distilled_runtime_endpoint_template_rebind_failed/)
  assert.match(repair, /throw error/)
  assert.match(route, /runpodMassDistilledProvisionV2/)
  assert.match(route, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true/)
})
