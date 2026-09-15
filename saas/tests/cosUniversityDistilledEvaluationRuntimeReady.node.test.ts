import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('independent evaluation proves exact RunPod readiness before every inference POST', () => {
  assert.match(route, /RUNPOD_READY_TIMEOUT_MS = 220_000/)
  assert.match(route, /RUNPOD_READY_POLL_MS = 3_000/)
  assert.match(route, /RUNPOD_ENDPOINT_HOST = \/\^\[A-Za-z0-9_-\]/)
  assert.match(route, /url\.pathname === '\/v1\/chat\/completions'/)
  assert.match(route, /if \(isRunpodEvaluationInference\(url, init\)\) \{\s*await proveRunpodReady\(\{ origin: url\.origin, fetchImpl: routeBoundFetch, routeDeadlineMs: input\.routeDeadlineMs \}\)/)
})

test('runtime readiness uses non-inference GET probes and requires HTTP 200', () => {
  assert.match(route, /input\.fetchImpl\(`\$\{input\.origin\}\/ready`/)
  assert.match(route, /headers: \{ Authorization: `Bearer \$\{key\}` \}/)
  assert.match(route, /if \(response\.status === 200\) return/)
  assert.match(route, /detail\.includes\('distilled_bootstrap_failed'\)/)
  assert.match(route, /distilled_evaluation_runtime_bootstrap_failed/)
})

test('one durable cost-bounded attempt is consumed before any runtime wake', () => {
  assert.match(route, /MAX_RUNTIME_WAKE_ATTEMPTS = 1/)
  assert.match(route, /MAX_RUNTIME_WAKE_COST_USD = 0\.2/)
  assert.match(route, /RUNTIME_ATTEMPT_PROFILE = 'cos_distilled_independent_evaluation_runtime_v1'/)
  assert.match(route, /maxRuntimeWakeAttempts\?\? 0\) === MAX_RUNTIME_WAKE_ATTEMPTS/)
  assert.match(route, /runtimeCostCeiling >= RUNTIME_WAKE_WORST_CASE_COST_USD/)
  assert.match(route, /event_key: eventKey/)
  assert.match(route, /code \|\| ''\) === '23505'/)
  assert.match(route, /bounded_runtime_evaluation_attempt_already_consumed/)
  assert.match(route, /claimRuntimeEvaluationAttempt\(new Date\(\)\)[\s\S]*runWithEvaluationTransportGuards/)
})

test('shared route deadline and keepalive bound cold-start work under the function ceiling', () => {
  assert.match(route, /export const maxDuration = 600/)
  assert.match(route, /EVALUATION_ROUTE_BUDGET_MS = 570_000/)
  assert.match(route, /EVALUATION_ROUTE_RESERVE_MS = 30_000/)
  assert.match(route, /RUNPOD_KEEPALIVE_INTERVAL_MS = 30_000/)
  assert.match(route, /boundedSignal\(existing, remaining - EVALUATION_ROUTE_RESERVE_MS\)/)
  assert.match(route, /setInterval\(\(\) =>/)
  assert.match(route, /routeBoundFetch\(`\$\{origin\}\/ready`/)
  assert.match(route, /for \(const timer of keepalives\.values\(\)\) clearInterval\(timer\)/)
  assert.match(route, /distilled_evaluation_route_deadline_exceeded/)
})

test('successful evaluation retains exactly eight inference and four judge call ceilings', () => {
  assert.match(route, /ENDPOINT_CALLS_CEILING = 8/)
  assert.match(route, /JUDGE_CALLS_CEILING = 4/)
  assert.match(route, /productionTrafficAuthorized: false/)
  assert.match(route, /authorityExpanded: false/)
})
