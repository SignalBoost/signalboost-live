import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runpodServerlessOpenAiBaseUrl, safeRunpodErrorDetail } from '../lib/ai/cos/runpodServerlessDistilledProvision.ts'

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

test('RunPod distilled deployment uses documented scale-to-zero endpoint fields', () => {
  assert.match(provision, /workersMin:\s*0/)
  assert.match(provision, /workersMax:\s*1/)
  assert.match(provision, /idleTimeout:\s*5/)
  assert.match(provision, /scalerType:\s*'REQUEST_COUNT'/)
  assert.match(provision, /gpuTypeIds:\s*GPU_TYPES/)
  assert.doesNotMatch(provision, /gpuTypePriority\s*:/)
  assert.doesNotMatch(provision, /volumeInGb\s*:/)
  assert.doesNotMatch(provision, /volumeMountPath\s*:/)
  assert.match(provision, /containerDiskInGb:\s*50/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
})

test('RunPod OpenAI compatibility uses the official v2 endpoint shape', () => {
  assert.equal(
    runpodServerlessOpenAiBaseUrl('abc_123'),
    'https://api.runpod.ai/v2/abc_123/openai/v1',
  )
  assert.throws(() => runpodServerlessOpenAiBaseUrl('../bad'), /endpoint id is invalid/)
  assert.match(provision, /\$\{baseUrl\}\/chat\/completions/)
  assert.doesNotMatch(provision, /\.api\.runpod\.ai\/v1\/chat\/completions/)
})

test('RunPod error details are bounded and credential-like fields are redacted', () => {
  assert.equal(safeRunpodErrorDetail('{"message":"gpuTypePriority is not allowed"}'), 'gpuTypePriority is not allowed')
  assert.equal(safeRunpodErrorDetail('{"error":{"code":"invalid_request","message":"bad field"}}'), 'bad field')
  assert.equal(safeRunpodErrorDetail('not-json-provider-body'), null)
  const redacted = safeRunpodErrorDetail('{"message":"token: super-secret-value rejected"}')
  assert.equal(redacted, 'token=[redacted] rejected')
})

test('deployment requires explicit durable unexpired approval and does not authorize Production traffic', () => {
  assert.match(route, /local_distilled_runtime_deploy_approved/)
  assert.match(route, /canaryAuthorized !== true/)
  assert.match(route, /verifier !== 'host_controller'/)
  assert.match(route, /expires_at/)
  assert.match(route, /MAX_CANARY_INVOCATIONS = 3/)
  assert.match(route, /MIN_BALANCE_USD = 1/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
  assert.doesNotMatch(route, /RUNPOD_PRIMARY_MODE\s*=|RUNPOD_SERVERLESS_LLM_ENDPOINT_ID\s*=/)
})

test('private provider credentials are never returned or logged by the provisioner', () => {
  assert.match(provision, /HF_TOKEN/)
  assert.doesNotMatch(provision, /console\.(log|info|warn|error).*HF_TOKEN/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY.*NextResponse|HF_TOKEN.*NextResponse/)
})
