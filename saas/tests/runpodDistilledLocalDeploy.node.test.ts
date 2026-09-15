// saas/tests/runpodDistilledLocalDeploy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
  DISTILLED_IDLE_TIMEOUT_SECONDS,
  DISTILLED_STARTUP_READY_TIMEOUT_MS,
  DISTILLED_WORST_CASE_CANARY_COST_USD,
  runpodServerlessOpenAiBaseUrl,
  safeRunpodErrorDetail,
} from '../lib/ai/cos/runpodServerlessDistilledProvision.ts'

const provision = readFileSync(new URL('../lib/ai/cos/runpodServerlessDistilledProvision.ts', import.meta.url), 'utf8')
const cleanup = readFileSync(new URL('../lib/ai/cos/runpodServerlessLegacyQueueCleanup.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('distilled runtime is pinned to the exact trained Qwen artifact', () => {
  assert.match(provision, /Qwen\/Qwen3-4B/)
  assert.match(provision, /1cfa9a7208912126459214e8b04321603b3df60c/)
  assert.match(provision, /cadomos\/itmounts-student-f993a365a01e/)
  assert.match(provision, /9f03387d87de550b96d973f9f30a3f02e783997e/)
  assert.match(provision, /vllm\/vllm-openai:v0\.29\.0/)
  assert.match(provision, /snapshot_download/)
  assert.match(provision, /--enable-lora/)
  assert.match(provision, /"--max-lora-rank", "16"/)
})

test('RunPod distilled deployment stays scale-to-zero, one-worker bounded and inside the owner canary ceiling', () => {
  assert.equal(DISTILLED_IDLE_TIMEOUT_SECONDS, 60)
  assert.equal(DISTILLED_STARTUP_READY_TIMEOUT_MS, 220_000)
  assert.equal(DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS, 60_000)
  assert.equal(DISTILLED_WORST_CASE_CANARY_COST_USD, ((60 + 220 + 60) * 0.69) / 3600)
  assert.ok(DISTILLED_WORST_CASE_CANARY_COST_USD < 0.2)
  assert.match(provision, /min:\s*0/)
  assert.match(provision, /max:\s*1/)
  assert.match(provision, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
  assert.match(provision, /NVIDIA RTX A5000/)
  assert.match(provision, /NVIDIA GeForce RTX 3090/)
  assert.match(provision, /NVIDIA L4/)
})

test('exact bootstrap template is isolated while endpoint discovery and creation use REST v2', () => {
  assert.match(provision, /const REST_V1 = 'https:\/\/rest\.runpod\.io\/v1'/)
  assert.match(provision, /const CONTROL_API_V2 = 'https:\/\/api\.runpod\.io\/v2'/)
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v3'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v4'/)
  assert.match(provision, /requestV1<RunpodTemplateV1\[]>\('\/templates'\)/)
  assert.match(provision, /requestV2<\{ endpoints\?: RunpodEndpointV2\[] \}>\('\/serverless'\)/)
  assert.match(provision, /requestV2<RunpodEndpointV2>\('\/serverless'/)
  assert.match(provision, /type:\s*DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /templateId:\s*template\.id/)
  assert.match(provision, /gpu:\s*\{[\s\S]*pools:\s*gpu\.pools,[\s\S]*count:\s*1/)
  assert.match(provision, /containerDiskInGb:\s*50/)
  assert.match(provision, /dockerEntrypoint:\s*\['bash', '-lc'\]/)
  assert.match(provision, /dockerStartCmd:\s*\[startupCommand\(\)\]/)
})

test('startup gateway becomes routable before exact model initialization and can use RunPod cached base weights', () => {
  assert.match(provision, /function startupGatewaySource\(\)/)
  assert.match(provision, /\/runpod-volume\/huggingface-cache\/hub/)
  assert.match(provision, /models--\{org\}--\{name\}/)
  assert.match(provision, /snapshots.*BASE_REV/)
  assert.match(provision, /@app\.get\("\/ping"\)/)
  assert.match(provision, /@app\.get\("\/ready"\)/)
  assert.match(provision, /asyncio\.create_task\(bootstrap\(\)\)/)
  assert.match(provision, /ITMOUNTS_INTERNAL_VLLM_PORT/)
  assert.match(provision, /127\.0\.0\.1/)
  assert.match(provision, /distilled_bootstrap_failed/)
  assert.match(provision, /waitForRunpodServerlessDistilledReady/)
  assert.match(provision, /DISTILLED_STARTUP_READY_TIMEOUT_MS/)
})

test('a healthy gateway still loading at the readiness deadline uses the bounded inference window', () => {
  assert.match(provision, /if \(response\.status === 204\) lastError = null/)
  assert.match(provision, /if \(!readiness\.ok && readiness\.httpStatus !== 204\)/)
  const readinessGate = provision.indexOf("readiness.httpStatus !== 204")
  const inferenceCall = provision.indexOf("${baseUrl}/chat/completions")
  assert.ok(readinessGate >= 0 && inferenceCall > readinessGate)
})

test('startup gateway falls back to exact Hugging Face revisions without changing artifact identity', () => {
  assert.match(provision, /repo_id=BASE_ID/)
  assert.match(provision, /revision=BASE_REV/)
  assert.match(provision, /repo_id=ADAPTER_ID/)
  assert.match(provision, /revision=ADAPTER_REV/)
  assert.match(provision, /local_dir="\/models\/base"/)
  assert.match(provision, /local_dir="\/models\/adapter"/)
  assert.match(provision, /"--lora-modules", lora/)
})

test('v2 endpoint policy uses nested worker and scaling fields only', () => {
  const policyStart = provision.indexOf('function endpointV2PolicyPayload()')
  const policyEnd = provision.indexOf('function serverlessGpuCandidates')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  const policy = provision.slice(policyStart, policyEnd)
  assert.match(policy, /workers:\s*\{[\s\S]*min:\s*0,[\s\S]*max:\s*1,[\s\S]*idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(policy, /scaling:\s*\{[\s\S]*type:\s*'REQUEST_COUNT',[\s\S]*requestCount:\s*1/)
  assert.match(policy, /timeout:\s*300_000/)
  assert.match(policy, /flashboot:\s*'FLASHBOOT'/)
  assert.doesNotMatch(policy, /executionTimeoutMs\s*:/)
  assert.doesNotMatch(policy, /scalerType\s*:/)
  assert.doesNotMatch(policy, /scalerValue\s*:/)
  assert.doesNotMatch(policy, /workersMin\s*:/)
  assert.doesNotMatch(policy, /workersMax\s*:/)
  assert.doesNotMatch(policy, /gpuTypeIds\s*:|gpuCount\s*:/)
})

test('v4 GPU selection stays on the standard 16 GB and 24 GB pools inside the owner ceiling', () => {
  assert.match(provision, /requestV2<\{ gpus\?: RunpodGpuCatalogItemV2\[] \}>\('\/catalog\/gpus'\)/)
  assert.match(provision, /Number\(item\.memory \|\| 0\) >= 16/)
  assert.match(provision, /Number\(item\.memory \|\| 0\) <= 24/)
  assert.match(provision, /APPROVED_SERVERLESS_GPU_POOLS = \[[\s\S]*'AMPERE_16',[\s\S]*'AMPERE_24'/)
  assert.doesNotMatch(provision, /APPROVED_SERVERLESS_GPU_POOLS = \[[\s\S]*'ADA_24'/)
  assert.match(provision, /MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0\.69/)
  assert.match(provision, /item\.availability !== 'NONE'/)
  assert.match(provision, /pools\.length < APPROVED_SERVERLESS_GPU_POOLS\.length/)
  assert.match(provision, /RunPod catalog does not currently expose both approved 16 GB and 24 GB Serverless pools/)
})

test('existing endpoint policy is reconciled before a paid canary', () => {
  assert.match(route, /reconcileRunpodServerlessDistilledEndpoint\(endpointId\)/)
  assert.match(route, /CANARY_HTTP_ATTEMPTS_PER_INVOCATION = 1/)
  assert.match(route, /timeoutMs:\s*DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS/)
  assert.match(route, /httpAttempts:\s*CANARY_HTTP_ATTEMPTS_PER_INVOCATION/)
})

test('each provider invocation is durably receipted before the bounded network call', () => {
  assert.match(route, /CANARY_STARTED_CLAIM = 'local_distilled_runtime_canary_started'/)
  assert.match(route, /const starts = refreshed\.filter/)
  assert.match(route, /const consumedInvocations = Math\.max\(failures, starts\)/)
  assert.match(route, /consumedInvocations >= approvedMaxCanaryInvocations/)
  const receipt = route.indexOf('await record(CANARY_STARTED_CLAIM')
  const providerCall = route.indexOf('const canary = await canaryRunpodServerlessDistilledLlm')
  assert.ok(receipt >= 0 && providerCall > receipt)
  assert.match(route.slice(receipt, providerCall), /startedAt/)
  assert.match(route.slice(receipt, providerCall), /productionTrafficAuthorized:\s*false/)
})

test('official RunPod endpoint health is captured around canary execution', () => {
  assert.match(provision, /\$\{SERVERLESS_API\}\/\$\{id\}\/health/)
  assert.match(provision, /workers:\s*Object\.freeze/)
  assert.match(provision, /inProgress:/)
  assert.match(provision, /inQueue:/)
  assert.match(route, /healthBefore = await runpodServerlessEndpointHealth\(endpointId\)/)
  assert.match(route, /healthAfter = await runpodServerlessEndpointHealth\(endpointId\)/)
  assert.match(route, /healthBefore,/)
  assert.match(route, /healthAfter,/)
})

test('append-only host suspension overrides older approval and performs only legacy queue cleanup', () => {
  assert.match(route, /SUSPEND_CLAIM = 'local_distilled_runtime_canary_suspended'/)
  assert.match(route, /function latestCanaryControl/)
  assert.match(route, /\[APPROVAL_CLAIM, SUSPEND_CLAIM\]/)
  assert.match(route, /cleanupLegacyQueueEndpoints\(rows\)/)
  assert.match(route, /canary_suspended_by_host_controller/)
  const controlIndex = route.indexOf('const control = latestCanaryControl(rows)')
  const cleanupIndex = route.indexOf('const cleanup = await cleanupLegacyQueueEndpoints(rows)')
  const approvalIndex = route.indexOf('const approval = validApproval(rows)')
  assert.ok(controlIndex >= 0 && cleanupIndex > controlIndex && approvalIndex > cleanupIndex)
})

test('legacy cleanup can only target provisioned endpoints superseded by the new load-balancer identity', () => {
  assert.match(route, /function legacyQueueEndpointIds/)
  assert.match(route, /evidence\?\.claim !== 'local_distilled_runtime_endpoint_provisioned'/)
  assert.match(route, /String\(evidence\?\.endpointName \|\| ''\) === DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /String\(evidence\?\.routing \|\| ''\) === DISTILLED_ENDPOINT_ROUTING/)
  assert.match(route, /if \(!isCurrentLoadBalancer\) ids\.add\(endpointId\)/)
})

test('legacy queue purge removes pending jobs only and is idempotently receipted', () => {
  assert.match(cleanup, /\/purge-queue/)
  assert.match(cleanup, /method:\s*'POST'/)
  assert.match(cleanup, /runpodServerlessEndpointHealth\(endpointId\)/)
  assert.doesNotMatch(cleanup, /\/cancel\//)
  assert.doesNotMatch(cleanup, /workersMin|workersMax|templateId|train|chat\/completions/)
  assert.match(route, /LEGACY_QUEUE_CLEANED_CLAIM/)
  assert.match(route, /cleanupSucceeded:\s*true/)
  assert.match(route, /already_cleaned/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
})

test('the distilled runtime is addressed as a load-balancer endpoint, not through the job queue', () => {
  assert.equal(runpodServerlessOpenAiBaseUrl('abc_123'), 'https://abc_123.api.runpod.ai/v1')
  assert.throws(() => runpodServerlessOpenAiBaseUrl('../bad'), /endpoint id is invalid/)
  assert.match(provision, /\$\{baseUrl\}\/chat\/completions/)
  assert.doesNotMatch(provision, /api\.runpod\.ai\/v2\/\$\{id\}\/openai\/v1/)
  assert.match(provision, /DISTILLED_ENDPOINT_ROUTING = 'LOAD_BALANCER'/)
  assert.match(provision, /type:\s*DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /HEALTH_CHECK_PATH: '\/ping'/)
  assert.match(provision, /PORT_HEALTH: String\(DISTILLED_CONTAINER_PORT\)/)
})

test('load-balancer template identity cannot reuse the failed pre-gateway runtime', () => {
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v3'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v4'/)
  assert.match(provision, /templateHasExactBootstrap/)
  assert.match(provision, /command\.includes\(DISTILLED_BASE_MODEL_REVISION\)/)
  assert.match(provision, /command\.includes\(DISTILLED_ADAPTER_MODEL_REVISION\)/)
  assert.match(provision, /command\.includes\('itmounts_distilled_gateway\.py'\)/)
  assert.match(provision, /throw new Error\('RunPod distilled load-balancer template exists but does not match the exact-artifact bootstrap contract'\)/)
})

test('routing mode is fixed at creation and never sent on the v2 update policy payload', () => {
  const policyStart = provision.indexOf('function endpointV2PolicyPayload()')
  const policyEnd = provision.indexOf('function serverlessGpuCandidates')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  assert.doesNotMatch(provision.slice(policyStart, policyEnd), /type:\s*DISTILLED_ENDPOINT_ROUTING/)
})

test('v2 reconciliation validates returned routing and bounded worker policy before canary use', () => {
  assert.match(provision, /endpoint\.type && endpoint\.type !== DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /endpoint\.workers\?\.min/)
  assert.match(provision, /endpoint\.workers\?\.max/)
  assert.match(provision, /endpoint\.workers\?\.idleTimeout/)
  assert.match(provision, /endpoint\.scaling\?\.type/)
  assert.match(provision, /endpoint\.scaling\?\.requestCount/)
  assert.match(provision, /endpoint\.timeout/)
})

test('a previously provisioned endpoint is only reused when its name and routing still match', () => {
  assert.match(route, /String\(row\?\.evidence\?\.endpointName \|\| ''\) === DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /String\(row\?\.evidence\?\.routing \|\| ''\) === DISTILLED_ENDPOINT_ROUTING/)
  assert.match(route, /endpointName: DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /routing: DISTILLED_ENDPOINT_ROUTING/)
})

test('RunPod error details are bounded and credential-like fields are redacted', () => {
  assert.equal(safeRunpodErrorDetail('{"message":"gpuTypePriority is not allowed"}'), 'gpuTypePriority is not allowed')
  assert.equal(safeRunpodErrorDetail('{"error":{"code":"invalid_request","message":"bad field"}}'), 'bad field')
  assert.equal(safeRunpodErrorDetail('{"errors":["additional properties type not allowed"]}'), 'additional properties type not allowed')
  assert.equal(safeRunpodErrorDetail('not-json-provider-body'), null)
  assert.equal(safeRunpodErrorDetail('{"message":"token: super-secret-value rejected"}'), 'token=[redacted] rejected')
})

test('deployment requires explicit durable unexpired approval and does not authorize Production traffic', () => {
  assert.match(route, /local_distilled_runtime_deploy_approved/)
  assert.match(route, /canaryAuthorized === true/)
  assert.match(route, /host_controller/)
  assert.match(route, /expires_at/)
  assert.match(route, /MAX_CANARY_INVOCATIONS = 3/)
  assert.match(route, /MIN_BALANCE_USD = 1/)
  assert.match(route, /maxEstimatedCanaryCostUsd/)
  assert.match(route, /approvedCostUsd >= \(approvedInvocations \* DISTILLED_WORST_CASE_CANARY_COST_USD\)/)
  assert.match(route, /approvedMaxCanaryInvocations = Number\(approval\.evidence\.maxCanaryInvocations\)/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
  assert.doesNotMatch(route, /RUNPOD_PRIMARY_MODE\s*=|RUNPOD_SERVERLESS_LLM_ENDPOINT_ID\s*=/)
})

test('private provider credentials are never returned or logged by the provisioner or queue cleanup', () => {
  assert.match(provision, /HF_TOKEN/)
  assert.match(cleanup, /RUNPOD_API_KEY/)
  assert.doesNotMatch(provision, /console\.(log|info|warn|error).*HF_TOKEN/)
  assert.doesNotMatch(cleanup, /console\.(log|info|warn|error).*RUNPOD_API_KEY/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY.*NextResponse|HF_TOKEN.*NextResponse/)
})
