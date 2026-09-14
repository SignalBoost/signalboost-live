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
  assert.match(provision, /workersMin:\s*0/)
  assert.match(provision, /workersMax:\s*1/)
  assert.match(provision, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
})

test('RunPod endpoint POST and PATCH follow the documented REST contract', () => {
  assert.match(provision, /name:\s*DISTILLED_ENDPOINT_NAME/)
  assert.match(provision, /templateId:\s*template\.id/)
  assert.match(provision, /gpuTypeIds:\s*GPU_TYPES/)
  assert.match(provision, /scalerType:\s*'REQUEST_COUNT'/)
  assert.match(provision, /scalerValue:\s*1/)
  assert.match(provision, /`\/endpoints\/\$\{encodeURIComponent\(id\)\}`/)
  assert.match(provision, /method:\s*'PATCH'/)
  assert.doesNotMatch(provision, /gpuTypePriority\s*:/)
  assert.doesNotMatch(provision, /volumeInGb\s*:/)
  assert.doesNotMatch(provision, /volumeMountPath\s*:/)
  assert.match(provision, /containerDiskInGb:\s*50/)
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

test('append-only host suspension overrides older approval without mutating assurance history', () => {
  assert.match(route, /SUSPEND_CLAIM = 'local_distilled_runtime_canary_suspended'/)
  assert.match(route, /function latestCanaryControl/)
  assert.match(route, /\[APPROVAL_CLAIM, SUSPEND_CLAIM\]/)
  assert.match(route, /canary_suspended_by_host_controller/)
  const controlIndex = route.indexOf('const control = latestCanaryControl(rows)')
  const approvalIndex = route.indexOf('const approval = validApproval(rows)')
  assert.ok(controlIndex >= 0 && approvalIndex > controlIndex)
})

test('the distilled runtime is addressed as a load-balancer endpoint, not through the job queue', () => {
  // The public vLLM image implements no RunPod queue handler, so the queue URL shape can never be
  // answered by this runtime. Routing must be LOAD_BALANCER and the address its own endpoint host.
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
  // A template is created only when its name is absent, so the pre-existing queue-mode template
  // would silently keep serving the old env. The name must move with the configuration.
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v1'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v1'/)
  assert.match(provision, /templates\.find\(item => item\.name === DISTILLED_TEMPLATE_NAME/)
})

test('routing mode is fixed at creation and never sent on the update policy payload', () => {
  const policyStart = provision.indexOf('function endpointPolicyPayload()')
  const policyEnd = provision.indexOf('export async function reconcileRunpodServerlessDistilledEndpoint')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  assert.doesNotMatch(provision.slice(policyStart, policyEnd), /type:/)
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

test('private provider credentials are never returned or logged by the provisioner', () => {
  assert.match(provision, /HF_TOKEN/)
  assert.doesNotMatch(provision, /console\.(log|info|warn|error).*HF_TOKEN/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY.*NextResponse|HF_TOKEN.*NextResponse/)
})
