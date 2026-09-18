import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const provision = readFileSync(new URL('../lib/ai/cos/runpodDistilledV6Provision.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-distilled-v6-local-deploy/route.ts', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('v6 uses immutable endpoint identity and exact trained artifact', () => {
  assert.match(provision, /DISTILLED_V6_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v4'/)
  assert.match(provision, /DISTILLED_V6_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v6'/)
  assert.match(provision, /cadomos\/itmounts-student-f993a365a01e/)
  assert.match(provision, /9f03387d87de550b96d973f9f30a3f02e783997e/)
  assert.match(route, /4176a5aeda84ceafeff9b0fc29af833d028d7a891b028d4c479b8ca653d7b65d/)
})

test('v6 reduces cold-start memory and compilation pressure', () => {
  assert.match(provision, /--gpu-memory-utilization','0\.85'/)
  assert.match(provision, /--max-model-len','8192'/)
  assert.match(provision, /--enforce-eager/)
})

test('v6 gateway never forwards inference before internal vllm health is ready', () => {
  assert.match(provision, /client\.get\(f'http:\/\/127\.0\.0\.1:\{INTERNAL\}\/health'\)/)
  assert.match(provision, /if r\.status_code==200: ready\.set\(\); return/)
  assert.match(provision, /if not ready\.is_set\(\): raise HTTPException\(status_code=503,detail='distilled_internal_vllm_not_ready'\)/)
  assert.match(provision, /if\(lastStatus!==200\)return \{ok:false/)
  assert.doesNotMatch(provision, /lastStatus!==204/)
})

test('v6 canary is a single bounded owner-approved attempt with no production traffic', () => {
  assert.match(route, /MAX_INVOCATIONS = 1/)
  assert.match(route, /DISTILLED_V6_MAX_COST_USD/)
  assert.match(route, /productionTrafficAuthorized:false/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true/)
})

test('v6 route is scheduled independently from the failed v5 route', () => {
  assert.match(vercel, /\/api\/cron\/runpod-distilled-v6-local-deploy/)
  assert.match(vercel, /\/api\/cron\/runpod-distilled-local-deploy/)
})
