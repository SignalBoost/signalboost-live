// saas/tests/runpodMassDistilledLocalDeploy.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260915100500_mass_distilled_runtime_canary_claim.sql', import.meta.url), 'utf8')
const endpointRefreshMigration = readFileSync(new URL('../supabase/migrations/20260921154000_mass_distilled_canary_endpoint_refresh_claim.sql', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('mass-distilled runtime derives immutable v2 identity from the exact artifact hash', () => {
  assert.match(provision, /artifactHash\.slice\(0,12\)/)
  assert.match(provision, /itmounts-mass-distilled-\$\{suffix\}-v2/)
  assert.match(provision, /artifactRevision/)
  assert.match(provision, /artifactId/)
  assert.match(provision, /Qwen\/Qwen3-4B/)
  assert.match(provision, /1cfa9a7208912126459214e8b04321603b3df60c/)
  assert.doesNotMatch(provision, /itmounts-student-f993a365a01e/)
  assert.doesNotMatch(route, /study-plan:e23cb043-715e-4406-8898-421159fae2df/)
})

test('mass-distilled runtime uses the proven v6 memory and cold-start contract inside the route deadline', () => {
  assert.match(provision, /--gpu-memory-utilization','0\.85'/)
  assert.match(provision, /--max-model-len','8192'/)
  assert.match(provision, /--enforce-eager/)
  assert.match(provision, /HEALTH_CHECK_PATH:'\/ping'/)
  assert.match(provision, /@app\.get\('\/ready'\)/)
  assert.match(provision, /127\.0\.0\.1/)
  assert.match(provision, /runpod-volume\/huggingface-cache\/hub/)
  assert.match(provision, /IDLE_TIMEOUT_SECONDS = 60/)
  assert.match(provision, /READY_TIMEOUT_MS = 380_000/)
  assert.match(provision, /CANARY_TIMEOUT_MS = 150_000/)
  assert.match(provision, /CANARY_MIN_TIMEOUT_MS = 35_000/)
  assert.match(provision, /READY_AND_CANARY_BUDGET_MS = READY_TIMEOUT_MS \+ CANARY_MIN_TIMEOUT_MS/)
  assert.match(provision, /REQUEST_TIMEOUT_MS = 8_000/)
  assert.match(provision, /HEALTH_TIMEOUT_MS = 5_000/)
  assert.match(provision, /enable_thinking.*False/)
  assert.match(provision, /chat_template_kwargs:\{enable_thinking:false\}/)
  assert.match(route, /maxDuration = 450/)
})

test('mass-distilled cold-start and inference windows remain inside the route deadline', () => {
  const ready = Number(/READY_TIMEOUT_MS = ([\d_]+)/.exec(provision)?.[1].replaceAll('_', ''))
  const canary = Number(/CANARY_TIMEOUT_MS = ([\d_]+)/.exec(provision)?.[1].replaceAll('_', ''))
  const canaryFloor = Number(/CANARY_MIN_TIMEOUT_MS = ([\d_]+)/.exec(provision)?.[1].replaceAll('_', ''))
  assert.equal(ready, 380_000)
  assert.equal(canary, 150_000)
  assert.equal(canaryFloor, 35_000)
  // Readiness and the first request share one budget, so the worst-case end is unchanged at 415s.
  const worstCaseEndMs = ready + canaryFloor
  assert.ok(worstCaseEndMs <= 415_000)
  assert.match(route, /maxDuration = 450/)
  const worstCaseGpuCostUsd = ((60 + worstCaseEndMs / 1000) * 0.69) / 3600
  assert.ok(worstCaseGpuCostUsd < 0.2)
})

test('mass-distilled provisioning releases only retired mass canary worker reservations', () => {
  assert.match(provision, /endpoint\.name\.startsWith\('itmounts-mass-distilled-'\)/)
  assert.match(provision, /endpoint\.name!==activeEndpointName/)
  assert.match(provision, /JSON\.stringify\(\{workers:\{min:0,max:0/)
  assert.match(provision, /await releaseRetiredMassEndpointCapacity\(current\.endpoints\|\|\[\],ids\.endpointName\)/)
  assert.doesNotMatch(provision, /releaseRetiredMassEndpointCapacity[\s\S]*method:'DELETE'/)
})

test('mass-distilled canary waits safely when account-wide RunPod worker quota is full', () => {
  assert.match(provision, /configuredServerlessWorkerQuota/)
  assert.match(provision, /reservedServerlessWorkerSlots/)
  assert.match(provision, /mass_distilled_runtime_worker_quota_full/)
  assert.match(provisionV2, /restoreRetiredEndpointCapacity\([\s\S]*constrainEndpointToApprovedGpu/)
  assert.match(route, /quotaBlocked/)
  assert.match(route, /runpod_worker_quota_full/)
  assert.match(route, /retryableWithinApproval:true/)
  assert.doesNotMatch(route, /runpod_worker_quota_full[\s\S]{0,300}status:500/)
})

test('v2 compatibility accepts a warm endpoint already narrowed to the governed 24GB pool', () => {
  assert.match(provisionV2, /message !== 'mass_distilled_runtime_endpoint_gpu_pool_drift'/)
  assert.match(provisionV2, /const APPROVED_POOLS = \['AMPERE_24'\] as const/)
  assert.match(provisionV2, /resolveExactEndpoint\(input\)/)
  assert.match(provisionV2, /constrainEndpointToApprovedGpu/)
})

test('v2 compatibility recovery tolerates delayed endpoint visibility by exact governed name', () => {
  assert.match(provisionV2, /resolveEndpointControlPlane/)
  assert.match(provisionV2, /requestV1<RestEndpointIdentity\[\]>\('\/endpoints'\)/)
  assert.match(provisionV2, /clean\(item\.name, 240\) === observedName/)
  assert.match(provisionV2, /for \(let attempt = 0; attempt < 5; attempt \+= 1\)/)
  assert.match(provisionV2, /constrainEndpointToApprovedGpu\(String\(provisioned\.endpointId\), String\(provisioned\.endpointName \|\| ''\)\)/)
  assert.match(provisionV2, /resolveEndpointControlPlane\('', ids\.endpointName\)/)
})

test('mass-distilled provisioning recovers an omitted v2 endpoint id from the official REST endpoint list', () => {
  assert.match(provision, /requestV1<RestEndpointIdentity\[\]>\('\/endpoints'\)/)
  assert.match(provision, /clean\(item\.name,240\)===endpointName/)
  assert.match(provision, /endpoint=await recoverEndpointId\(endpoint,ids\.endpointName\)/)
  assert.match(provision, /ENDPOINT_VISIBILITY_ATTEMPTS = 12/)
  assert.match(provision, /ENDPOINT_VISIBILITY_RETRY_MS = 2_000/)
  assert.equal((provision.match(/attempt<ENDPOINT_VISIBILITY_ATTEMPTS/g) || []).length, 2)
  assert.match(provision, /Never issue a second create while identity is settling/)
})

test('204 is never treated as inference-ready for mass artifacts', () => {
  assert.match(provision, /if\(payload\?\.ready===true\) break/)
  assert.match(provision, /if\(lastStatus!==200\) return/)
  assert.doesNotMatch(provision, /lastStatus\s*!==\s*204/)
  assert.doesNotMatch(provision, /lastStatus===204/)
  assert.match(provision, /if not ready\.is_set\(\): raise HTTPException\(status_code=503,detail='distilled_internal_vllm_not_ready'\)/)
})

test('existing endpoint reuse is bound to the exact template and approved GPU policy', () => {
  assert.match(provision, /endpoint\.templateId/)
  assert.match(provision, /mass_distilled_runtime_endpoint_template_mismatch/)
  assert.match(provision, /mass_distilled_runtime_endpoint_gpu_pool_drift/)
  assert.match(provision, /pools\.length!==APPROVED_POOLS\.length/)
  assert.match(provision, /Number\(endpoint\.gpu\?\.count/)
})

test('template drift is repaired only after the existing endpoint passes the non-template safety policy', () => {
  const safetyIndex = provision.indexOf('assertEndpointSafetyPolicy(endpoint)')
  const patchIndex = provision.indexOf("method:'PATCH'")
  assert.ok(safetyIndex >= 0 && patchIndex > safetyIndex)
  assert.match(provision, /`\/endpoints\/\$\{encodeURIComponent\(endpoint\.id\)\}`/)
  assert.match(provision, /JSON\.stringify\(\{templateId\}\)/)
  assert.match(provision, /requestV2<\{endpoints\?:Endpoint\[\]\}>\('\/serverless'\)/)
  assert.match(provision, /item\.id===endpoint\.id&&item\.name===endpoint\.name/)
  assert.match(provision, /mass_distilled_runtime_endpoint_template_rebind_missing/)
  assert.match(provision, /mass_distilled_runtime_endpoint_template_rebind_failed/)
  assert.match(provision, /assertEndpointPolicy\(refreshed,templateId\)/)
})

test('database atomically selects and reserves one owner-authorized canary across the whole corpus', () => {
  assert.match(migration, /create or replace function public\.claim_next_mass_distilled_runtime_canary\(\)/)
  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('mass-distilled-runtime-canary-global'/)
  assert.match(migration, /order by a\.created_at asc, a\.candidate_id asc/)
  assert.doesNotMatch(migration, /limit 20/)
  assert.match(migration, /for update/)
  assert.match(migration, /local_distilled_runtime_canary_suspended/)
  assert.match(migration, /v_evidence->>'claim' <> 'local_distilled_runtime_deploy_approved'/)
  assert.match(migration, /v_max_invocations <> 1/)
  assert.match(migration, /v_max_cost <= 0 or v_max_cost > 0\.200000/)
  assert.match(migration, /'reservationOnly',true/)
  assert.match(migration, /interval '8 minutes'/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_runtime_canary'\)/)
  assert.doesNotMatch(route, /\.limit\(20\)/)
})

test('route consumes the approval actual ceilings and never creates its own extra attempt', () => {
  assert.match(route, /Number\(claim\.max_canary_invocations\)!==1/)
  assert.match(route, /cost<=0\|\|cost>0\.2/)
  assert.match(route, /approvedCost=Number\(claim\.max_estimated_canary_cost_usd\)/)
  assert.match(route, /reservationEventKey/)
  assert.match(route, /claimNext\(\)/)
  assert.match(route, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true/)
})

test('mass pass evidence proves internal readiness and remains exact-artifact bound', () => {
  assert.match(route, /internalVllmReady:true/)
  assert.match(route, /recordFineTuneCanary/)
  assert.match(route, /claim:'production_canary_healthy'/)
  assert.match(route, /revisionKey:input\.revisionKey/)
  assert.match(route, /trainedArtifactId:input\.artifactId/)
  assert.match(route, /artifactHash:input\.artifactHash/)
})

test('mass-distilled route is scheduled independently from legacy and v6 single-artifact routes', () => {
  assert.match(vercel, /\/api\/cron\/runpod-mass-distilled-local-deploy/)
  assert.match(vercel, /\/api\/cron\/runpod-distilled-local-deploy/)
  assert.match(vercel, /\/api\/cron\/runpod-distilled-v6-local-deploy/)
})


test('rolling canary evidence loading cannot truncate old pass evidence behind unrelated fine-tune history', () => {
  assert.match(route, /ROLLING_EVENT_PROFILES/)
  assert.match(route, /MASS_CANARY_PROFILE/)
  assert.match(route, /cos_mass_distilled_independent_evaluation_runtime_v1/)
  assert.match(route, /cos_distilled_independent_evaluation_authorization_v1/)
  assert.match(route, /\.contains\('evidence',\{profile\}\)/)
  assert.match(route, /\.range\(from,from\+ROLLING_EVENT_PAGE_SIZE-1\)/)
  assert.doesNotMatch(route, /\.order\('observed_at',\{ascending:false\}\)\.limit\(5000\)/)
})


test('endpoint-refresh approval can re-canary an exact artifact that passed an older canary', () => {
  assert.match(endpointRefreshMigration, /create or replace function public\.claim_next_mass_distilled_runtime_canary\(\)/)
  assert.match(endpointRefreshMigration, /jsonb_typeof\(v_evidence->'endpointRefresh'\)='boolean'/)
  assert.match(endpointRefreshMigration, /\(v_evidence->>'endpointRefresh'\)::boolean=true/)
  assert.match(endpointRefreshMigration, /and e\.observed_at >= v_control\.observed_at/)
  assert.match(endpointRefreshMigration, /v_max_invocations <> 1/)
  assert.match(endpointRefreshMigration, /v_max_cost <= 0 or v_max_cost > 0\.200000/)
  assert.match(endpointRefreshMigration, /'productionTrafficAuthorized',false/)
})

test('historical canary pass still blocks ordinary duplicate approvals', () => {
  const passGate = endpointRefreshMigration.match(/if exists \([\s\S]*?local_distilled_runtime_canary_passed[\s\S]*?then continue; end if;/)?.[0]
  assert.ok(passGate)
  assert.match(passGate, /and not \(/)
  assert.match(passGate, /endpointRefresh/)
})


test('RunPod template discovery includes templates already bound to Serverless endpoints', () => {
  const legacy = source('../lib/ai/cos/runpodMassDistilledProvision.ts')
  const compat = source('../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
  const required = "/templates?includeEndpointBoundTemplates=true"
  assert.ok((legacy.match(/includeEndpointBoundTemplates=true/g) || []).length >= 2)
  assert.ok((compat.match(/includeEndpointBoundTemplates=true/g) || []).length >= 1)
  assert.match(legacy, new RegExp(required.replace(/[?]/g, '\\?')))
  assert.match(compat, new RegExp(required.replace(/[?]/g, '\\?')))
})
