import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('RunPod control-plane preflight fences stale endpoints before the paid runtime attempt', () => {
  assert.match(route, /RUNPOD_ENDPOINT_PREFLIGHT_TIMEOUT_MS = 8_000/)
  assert.match(route, /RUNPOD_PREFLIGHT_PROFILE = 'cos_distilled_evaluation_runpod_endpoint_preflight_v1'/)
  assert.match(route, /https:\/\/api\.runpod\.ai\/v2\/\$\{endpointId\}\/health/)
  assert.match(route, /response\.status === 404 \|\| response\.status === 410/)
  assert.match(route, /classification: 'transient'/)
  assert.match(route, /await persistRunpodEndpointClassification/)
  assert.match(route, /hasPersistedStaleRunpodEndpoint/)
  assert.match(route, /distilled_evaluation_runpod_endpoint_stale/)
  assert.match(route, /distilled_evaluation_runpod_endpoint_preflight_transient/)
  assert.match(route, /await preflightRunpodEndpoint\([\s\S]*claimRuntimeEvaluationAttempt\(new Date\(\), input\.routeDeadlineMs\)[\s\S]*await proveRunpodReady/)
})

test('stale endpoint classification is persisted without consuming billed authority', () => {
  assert.match(route, /profile: RUNPOD_PREFLIGHT_PROFILE/)
  assert.match(route, /claim: RUNPOD_PREFLIGHT_CLAIM/)
  assert.match(route, /paidRuntimeAttemptConsumed: false/)
  assert.match(route, /productionTrafficAuthorized: false/)
  assert.match(route, /authorityExpanded: false/)
  assert.match(route, /\.eq\('candidate_id', candidateId\)/)
  assert.match(route, /evidence\?\.classification === 'stale'/)
})
