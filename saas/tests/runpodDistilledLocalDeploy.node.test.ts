import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodServerlessDistilledProvision.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../../runpod/serverless-distilled-llm/start.sh', import.meta.url), 'utf8')

test('distilled runtime is pinned to the exact trained Qwen artifact', () => {
  assert.match(provision, /Qwen\/Qwen3-4B/)
  assert.match(provision, /1cfa9a7208912126459214e8b04321603b3df60c/)
  assert.match(provision, /cadomos\/itmounts-student-f993a365a01e/)
  assert.match(provision, /9f03387d87de550b96d973f9f30a3f02e783997e/)
  assert.match(worker, /snapshot_download/)
  assert.match(worker, /--enable-lora/)
  assert.match(worker, /--max-lora-rank 16/)
})

test('RunPod distilled deployment stays scale-to-zero and one-worker bounded', () => {
  assert.match(provision, /workersMin:\s*0/)
  assert.match(provision, /workersMax:\s*1/)
  assert.match(provision, /idleTimeout:\s*5/)
  assert.match(provision, /gpuTypePriority:\s*'availability'/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
})

test('deployment requires explicit durable approval and does not authorize Production traffic', () => {
  assert.match(route, /local_distilled_runtime_deploy_approved/)
  assert.match(route, /canaryAuthorized !== true/)
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
