// saas/tests/runpodDistilledLocalDeploy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
  DISTILLED_IDLE_TIMEOUT_SECONDS,
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
  assert.match(provision, /--max-lora-rank 16/)
})

test('RunPod distilled deployment stays scale-to-zero, one-worker bounded and temporarily warm', () => {
  assert.equal(DISTILLED_IDLE_TIMEOUT_SECONDS, 900)
  assert.equal(DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS, 120_000)
  assert.match(provision, /min:\s*0/)
  assert.match(provision, /max:\s*1/)
  assert.match(provision, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
})

test('RunPod creation stays v1-compatible while reconciliation follows current REST v2 Serverless contract', () => {
  assert.match(provision, /const REST = 'https:\/\/rest\.runpod\.io\/v1'/)
  assert.match(provision, /const CONTROL_API_V2 = 'https:\/\/api\.runpod\.io\/v2'/)
  assert.match(provision, /name:\s*DISTILLED_ENDPOINT_NAME/)
  assert.match(provision, /templateId:\s*template\.id/)
  assert.match(provision, /gpuTypeIds:\s*GPU_TYPES/)
  assert.match(provision, /requestV2<RunpodEndpointV2>/)
  assert.match(provision, /`\/serverless\/\$\{encodeURIComponent\(id\)\}`/)
  assert.match(provision, /workers:\s*\{[\s\S]*min:\s*0,[\s\S]*max:\s*1,[\s\S]*idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /scaling:\s*\{[\s\S]*type:\s*'REQUEST_COUNT',[\s\S]*requestCount:\s*1/)
  assert.match(provision, /timeout:\s*300_000/)
  assert.match(provision, /flashboot:\s*'FLASHBOOT'/)
  assert.doesNotMatch(provision, /gpuTypePriority\s*:/)
  assert.doesNotMatch(provision, /volumeInGb\s*:/)
  assert.doesNotMatch(provision, /volumeMountPath\s*:/)
  assert.match(provision, /containerDiskInGb:\s*50/)
})

test('v2 reconciliation never sends the rejected flat v1 update fields', () => {
  const policyStart = provision.indexOf('function endpointV2PolicyPayload()')
  const policyEnd = provision.indexOf('export async function reconcileRunpodServerlessDistilledEndpoint')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  const policy = provision.slice(policyStart, policyEnd)
  assert.doesNotMatch(policy, /executionTimeoutMs\s*:/)
  assert.doesNotMatch(policy, /scalerType\s*:/)
  assert.doesNotMatch(policy, /scalerValue\s*:/)
  assert.doesNotMatch(policy, /workersMin\s*:/)
  assert.doesNotMatch(policy, /workersMax\s*:/)
})

test('existing endpoint policy is reconciled before a paid canary', () => {
  assert.match(route, /reconcileRunpodServerlessDistilledEndpoint\(endpointId\)/)
  assert.match(route, /CANARY_HTTP_ATTEMPTS_PER_INVOCATION = 2/)
  assert.match(route, /timeoutMs:\s*DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS/)
  assert.match(route, /httpAttempts:\s*CANARY_HTTP_ATTEMPTS_PER_INVOCATION/)
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
  assert.match(provision, /type: DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /HEALTH_CHECK_PATH: '\/health'/)
  assert.match(provision, /PORT_HEALTH: String\(DISTILLED_CONTAINER_PORT\)/)
})

test('load-balancer port and health env can actually reach RunPod', () => {
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v1'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v1'/)
  assert.match(provision, /templates\.find\(item => item\.name === DISTILLED_TEMPLATE_NAME/)
})

test('routing mode is fixed at creation and never sent on the v2 update policy payload', () => {
  const policyStart = provision.indexOf('function endpointV2PolicyPayload()')
  const policyEnd = provision.indexOf('export async function reconcileRunpodServerlessDistilledEndpoint')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  assert.doesNotMatch(provision.slice(policyStart, policyEnd), /type:\s*DISTILLED_ENDPOINT_ROUTING/)
})

test('gpu pool constraints are creation-only and never resent by routine reconciliation', () => {
  const policyStart = provision.indexOf('function endpointV2PolicyPayload()')
  const policyEnd = provision.indexOf('export async function reconcileRunpodServerlessDistilledEndpoint')
  const creationStart = provision.indexOf("name: DISTILLED_ENDPOINT_NAME")
  const creationEnd = provision.indexOf('...legacyEndpointCreationPolicyPayload()', creationStart)
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  assert.ok(creationStart >= 0 && creationEnd > creationStart)
  const policy = provision.slice(policyStart, policyEnd)
  const creation = provision.slice(creationStart, creationEnd)
  assert.doesNotMatch(policy, /gpuCount\s*:|gpuTypeIds\s*:/)
  assert.match(policy, /min:\s*0/)
  assert.match(policy, /max:\s*1/)
  assert.match(policy, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(creation, /gpuCount:\s*1/)
  assert.match(creation, /gpuTypeIds:\s*GPU_TYPES/)
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
