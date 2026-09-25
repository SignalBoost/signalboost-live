import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const compatibility = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260915233000_mass_distilled_canary_preflight_reliability.sql', import.meta.url), 'utf8')

test('normal approved canaries receive approval-scoped provider runtime identities', () => {
  assert.match(provision, /runtimeKey\?: string/)
  assert.match(provision, /itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-v3/)
  assert.match(compatibility, /itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-v3/)
  assert.match(route, /mass-canary-runtime-v3/)
  assert.match(route, /artifact\.artifactHash,approvalAt/)
  assert.match(route, /\.\.\.artifact,runtimeKey/)
})

test('canary-specific provider preflight is completed before the one paid/model invocation is consumed', () => {
  const provisionIndex = route.indexOf('provisionMassDistilledCanaryRuntime(runtimeArtifact)')
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

test('canary compatibility permits ordered 24GB to 16GB availability fallback without changing evaluator policy', () => {
  assert.match(compatibility, /const CANARY_APPROVED_POOLS = \['AMPERE_24', 'AMPERE_16', 'ADA_24'\] as const/)
  assert.match(compatibility, /provisionMassDistilledCanaryRuntime/)
  assert.match(compatibility, /const pools = selectMassDistilledCanaryPools\(catalogGpus\)/)
  assert.match(compatibility, /const provisioned = await provisionMassDistilledRuntimeWithPools\(input, pools\)/)
  assert.match(compatibility, /provisionMassDistilledRuntimeWithPools\(input, APPROVED_POOLS\)/)
})

test('compatibility layer uses the same v4 template identity as the creator', () => {
  assert.match(provision, /templateName:`itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-template-v4`/)
  assert.match(compatibility, /templateName: `itmounts-mass-distilled-\$\{suffix\}-\$\{runtimeKey\}-template-v4`/)
})

test('native v2 layer repairs exact endpoint materialization without the v1 template index', () => {
  assert.doesNotMatch(compatibility, /includeEndpointBoundTemplates/)
  assert.doesNotMatch(compatibility, /provisionLegacyMassDistilledRuntime/)
  assert.match(compatibility, /nativeV2EndpointConfig/)
  assert.match(compatibility, /massDistilledRuntimeInlineContainer/)
  assert.match(compatibility, /assertNonGpuEndpointSafetyPolicy\(endpoint, idleTimeoutSeconds\)/)
  assert.match(compatibility, /materializedEndpointMatches/)
})

test('canary evidence persists exact resume identity plus observable RunPod GPU catalog telemetry', () => {
  assert.match(route, /coldStartResumeEndpointId:coldStartResume\.endpointId/)
  assert.match(route, /coldStartResumeRuntimeKey:coldStartResume\.runtimeKey/)
  assert.match(route, /configuredGpuPools:provisioned\.gpuPools/)
  assert.match(route, /canaryEligibleGpuPools:provisioned\.canaryEligibleGpuPools/)
  assert.match(route, /canaryCatalogObserved:provisioned\.canaryCatalogObserved/)
  assert.match(route, /canaryCatalogServerlessPriceUsdPerHourByPool:provisioned\.canaryCatalogServerlessPriceUsdPerHourByPool/)
  assert.match(route, /actualWorkerGpuPoolObserved:provisioned\.actualWorkerGpuPoolObserved/)
  assert.match(compatibility, /actualWorkerGpuPoolObserved: false as const/)
})

test('cold-start continuation reuses only the explicitly approved exact runtime identity', () => {
  assert.match(route, /approvedColdStartResume/)
  assert.match(route, /coldStartResume===true/)
  assert.match(route, /coldStartResumeEndpointId/)
  assert.match(route, /coldStartResumeRuntimeKey/)
  assert.match(route, /coldStartResume\?\.runtimeKey \|\| hash\(\['mass-canary-runtime-v3'/)
  assert.match(route, /provisioned\.endpointId!==coldStartResume\.endpointId/)
  assert.match(route, /mass_distilled_cold_start_resume_endpoint_mismatch/)
  assert.match(route, /maxCanaryInvocations:1/)
  assert.match(route, /maxEstimatedCanaryCostUsd:approvedCost/)
})


test('RunPod load-balancer health stays initializing until internal vLLM is truly ready', () => {
  assert.match(provision, /template-v4/)
  assert.match(provision, /if not ready\.is_set\(\): return Response\(status_code=204\)/)
  assert.match(provision, /return \{'status':'ready','modelReady':True,'model':MODEL\}/)
  assert.match(provision, /HEALTH_CHECK_PATH:'\/ping'/)
})

test('canary observes RunPod control-plane ready workers instead of holding a custom readiness route open', () => {
  assert.match(provision, /workers:\{idle:Number\(payload\?\.workers\?\.idle\|\|0\),ready:Number\(payload\?\.workers\?\.ready\|\|0\)/)
  assert.match(provision, /const wake=await fetch\(\`\$\{root\}\/ping\`/)
  assert.match(provision, /if\(health\.workers\.ready>0\)/)
  const start = provision.indexOf('export async function canaryMassDistilledRuntime')
  const end = provision.indexOf('export const MASS_DISTILLED_CANARY_MAX_COST_USD', start)
  const body = provision.slice(start, end)
  assert.doesNotMatch(body, /fetch\(\`\$\{root\}\/ready\`/)
})


test('new mass canary endpoints pin the exact RunPod cached base-model revision', () => {
  assert.match(provision, /const BASE_MODEL_REFERENCE = `https:\/\/huggingface\.co\/\$\{BASE_MODEL_ID\}:\$\{BASE_MODEL_REVISION\}`/)
  assert.match(provision, /modelReferences:\[BASE_MODEL_REFERENCE\]/)
  assert.match(provision, /modelReferences/)
  assert.match(provision, /mass_distilled_runtime_base_cache_binding_mismatch/)
})


test('new v4 templates recover delayed provider id visibility without duplicate creation', () => {
  assert.match(provision, /async function recoverTemplateId\(template:Template\|undefined,templateName:string\)/)
  assert.match(provision, /const exact=templates\.find\(item=>item\.name===templateName&&item\.isServerless!==false\)/)
  assert.match(provision, /attempt<ENDPOINT_VISIBILITY_ATTEMPTS/)
  assert.match(provision, /ENDPOINT_VISIBILITY_RETRY_MS/)
  assert.match(provision, /template=await recoverTemplateId\(template,ids\.templateName\)/)
  const provisionStart = provision.indexOf('export async function provisionMassDistilledRuntime')
  const provisionBody = provision.slice(provisionStart)
  assert.equal((provisionBody.match(/requestV1<Template>\('\/templates',\{method:'POST'/g) || []).length, 1)
})


test('approved canary explicitly warm-starts exactly one worker then restores scale-to-zero before proof', () => {
  assert.match(compatibility, /export async function activateMassDistilledCanaryWorker/)
  assert.match(compatibility, /workers: \{ min: 1, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS \}/)
  assert.match(compatibility, /export async function deactivateMassDistilledCanaryWorker/)
  assert.match(compatibility, /workers: \{ min: 0, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS \}/)

  const invocation = route.indexOf('claim:INVOCATION_STARTED')
  const activate = route.indexOf('activateMassDistilledCanaryWorker(provisioned.endpointId)')
  const canary = route.indexOf('canaryMassDistilledRuntime({endpointId:provisioned.endpointId')
  const deactivate = route.indexOf('deactivateMassDistilledCanaryWorker(provisioned.endpointId)')
  const scaleDownGate = route.indexOf('if(scaleDownError)')
  const canonicalPass = route.indexOf('recordFineTuneCanary({candidateId:runtimeArtifact.candidateId')

  assert.ok(invocation >= 0)
  assert.ok(activate > invocation, 'paid worker activation must happen only after durable invocation evidence')
  assert.ok(canary > activate, 'inference canary must run only after explicit worker activation')
  assert.ok(deactivate > canary, 'worker must be restored after the canary')
  assert.ok(scaleDownGate > deactivate, 'scale-down failure must be checked')
  assert.ok(canonicalPass > scaleDownGate, 'canonical healthy proof must be written only after successful scale-down')
  assert.match(route, /mass_distilled_canary_scale_down_failed/)
  assert.match(route, /explicitWorkerWarmStart:true/)
})

test('explicit canary warm-start never widens worker count, GPU pools, promotion, or Production traffic authority', () => {
  const activateStart = compatibility.indexOf('export async function activateMassDistilledCanaryWorker')
  const deactivateStart = compatibility.indexOf('export async function deactivateMassDistilledCanaryWorker')
  const block = compatibility.slice(activateStart, compatibility.indexOf('/** Restore the exact endpoint', activateStart))
  assert.match(block, /min: 1, max: 1/)
  assert.doesNotMatch(block, /max: [2-9]/)
  assert.match(block, /canaryEndpointPools\(endpoint\)/)
  assert.match(block, /CANARY_APPROVED_POOLS\.includes/)
  assert.ok(deactivateStart > activateStart)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true|automaticPromotionAuthorized:true/)
})
