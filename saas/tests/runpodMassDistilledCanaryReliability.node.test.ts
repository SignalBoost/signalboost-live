import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const compatibility = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260915233000_mass_distilled_canary_preflight_reliability.sql', import.meta.url), 'utf8')

test('every approved canary receives an approval-scoped provider runtime identity', () => {
  assert.match(provision, /runtimeKey\?: string/)
  assert.match(provision, /itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-v3/)
  assert.match(compatibility, /itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-v3/)
  assert.match(route, /mass-canary-runtime-v3/)
  assert.match(route, /artifact\.artifactHash,approvalAt/)
  assert.match(route, /\.\.\.artifact,runtimeKey/)
})

test('provider preflight is completed before the one paid/model invocation is consumed', () => {
  const provisionIndex = route.indexOf('provisionMassDistilledRuntime(runtimeArtifact)')
  const invocationIndex = route.indexOf('claim:INVOCATION_STARTED')
  const canaryIndex = route.indexOf('canaryMassDistilledRuntime({endpointId:provisioned.endpointId')
  assert.ok(provisionIndex >= 0)
  assert.ok(invocationIndex > provisionIndex)
  assert.ok(canaryIndex > invocationIndex)
  assert.match(route, /providerInvocationStarted:true/)
})

test('preflight failures are durable, retryable within the same approval, and never claim Production traffic', () => {
  assert.match(route, /local_distilled_runtime_canary_preflight_failed/)
  assert.match(route, /providerInvocationStarted:false/)
  assert.match(route, /retryableWithinApproval:true/)
  assert.match(route, /automaticPromotionAuthorized:false/)
  assert.match(route, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true/)
})

test('atomic claim counts actual endpoint invocations instead of setup reservations', () => {
  assert.match(migration, /local_distilled_runtime_canary_invocation_started/)
  assert.match(migration, /local_distilled_runtime_canary_preflight_failed/)
  assert.match(migration, /v_preflight_failures >= 3/)
  assert.match(migration, /'maxPreflightFailures',3/)
  assert.match(migration, /'providerInvocationStarted',false/)
  const invocationCountIndex = migration.indexOf("e.evidence->>'claim'='local_distilled_runtime_canary_invocation_started'")
  const invocationGateIndex = migration.indexOf('if v_invocations >= v_max_invocations')
  assert.ok(invocationCountIndex >= 0 && invocationGateIndex > invocationCountIndex)
})

test('a durable preflight failure releases the short reservation lease immediately', () => {
  assert.match(migration, /t\.evidence->>'reservationEventKey'=s\.event_key/)
  assert.match(migration, /local_distilled_runtime_canary_preflight_failed/)
  assert.match(migration, /interval '8 minutes'/)
})

test('compatibility layer can recover both legacy template and endpoint identity drift', () => {
  assert.match(compatibility, /mass_distilled_runtime_template_identity_mismatch/)
  assert.match(compatibility, /mass_distilled_runtime_endpoint_template_mismatch/)
  assert.match(compatibility, /mass_distilled_runtime_endpoint_template_rebind_failed/)
  assert.match(compatibility, /assertEndpointSafetyPolicy\(endpoint\)/)
  assert.match(compatibility, /materializedEndpointMatches/)
})
