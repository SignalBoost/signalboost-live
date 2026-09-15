import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('independent evaluation proves exact RunPod readiness before every inference POST', () => {
  assert.match(route, /RUNPOD_READY_TIMEOUT_MS = 300_000/)
  assert.match(route, /RUNPOD_READY_POLL_MS = 3_000/)
  assert.match(route, /RUNPOD_INFERENCE_TIMEOUT_MS = 120_000/)
  assert.match(route, /RUNPOD_ENDPOINT_HOST = \/\^\[A-Za-z0-9_-\]/)
  assert.match(route, /url\.pathname === '\/v1\/chat\/completions'/)
  assert.match(route, /if \(isRunpodEvaluationInference\(url, init\)\) \{[\s\S]*await proveRunpodReady\(\{ origin: url\.origin, fetchImpl: routeBoundFetch, routeDeadlineMs: input\.routeDeadlineMs \}\)/)
})

test('RunPod inference receives a fresh timeout only after cold-start readiness', () => {
  assert.match(route, /await proveRunpodReady\([\s\S]*const inferenceBudget = input\.routeDeadlineMs - Date\.now\(\) - EVALUATION_ROUTE_RESERVE_MS/)
  assert.match(route, /guardedInit = \{[\s\S]*signal: AbortSignal\.timeout\(Math\.min\(RUNPOD_INFERENCE_TIMEOUT_MS, inferenceBudget\)\)/)
  assert.match(route, /routeBoundFetch\(request, guardedInit\)/)
  assert.doesNotMatch(route, /routeBoundFetch\(request, init\)/)
})

test('runtime readiness uses non-inference GET probes and requires HTTP 200', () => {
  assert.match(route, /input\.fetchImpl\(`\$\{input\.origin\}\/ready`/)
  assert.match(route, /headers: \{ Authorization: `Bearer \$\{key\}` \}/)
  assert.match(route, /if \(response\.status === 200\) return/)
  assert.match(route, /detail\.includes\('distilled_bootstrap_failed'\)/)
  assert.match(route, /distilled_evaluation_runtime_bootstrap_failed/)
  assert.match(route, /no additional inference call is used to warm the worker/)
})

test('one durable cost-bounded attempt is consumed only at the first billed wake boundary', () => {
  assert.match(route, /MAX_RUNTIME_WAKE_ATTEMPTS = 1/)
  assert.match(route, /MAX_RUNTIME_WAKE_COST_USD = 0\.2/)
  assert.match(route, /RUNTIME_ATTEMPT_PROFILE = 'cos_distilled_independent_evaluation_runtime_v1'/)
  assert.match(route, /Number\(evidence\?\.maxRuntimeWakeAttempts \|\| 0\) === MAX_RUNTIME_WAKE_ATTEMPTS/)
  assert.match(route, /runtimeCostCeiling >= RUNTIME_WAKE_WORST_CASE_COST_USD/)
  assert.match(route, /event_key: eventKey/)
  assert.match(route, /code \|\| ''\) === '23505'/)
  assert.match(route, /bounded_runtime_evaluation_attempt_already_consumed/)
  assert.match(route, /if \(isRunpodEvaluationInference\(url, init\)\) \{[\s\S]*if \(!key\) throw new Error\('distilled_evaluation_runpod_key_missing'\)[\s\S]*claimRuntimeEvaluationAttempt\(new Date\(\), input\.routeDeadlineMs\)[\s\S]*await proveRunpodReady/)
  assert.doesNotMatch(route, /const runtimeAttempt = await claimRuntimeEvaluationAttempt\(new Date\(\), routeDeadlineMs\)/)
})

test('no-cost evaluator preflight can skip without consuming the wake attempt', () => {
  assert.match(route, /const guarded = await runWithEvaluationTransportGuards\(\{[\s\S]*runner: \(\) => runUniversityDistilledArtifactEvaluation\(new Date\(\)\)/)
  assert.match(route, /let runtimeAttempt: SuccessfulRuntimeAttempt \| null = null/)
  assert.match(route, /return \{ result, runtimeAttempt \}/)
  assert.match(route, /runtimeAttemptAuthorizationObservedAt: runtimeAttempt\?\.authorizationObservedAt \?\? null/)
})

test('shared route deadline starts before evaluator and database preflight', () => {
  assert.match(route, /const routeDeadlineMs = Date\.now\(\) \+ EVALUATION_ROUTE_BUDGET_MS[\s\S]*withinRouteDeadline\(independentEvaluatorConfig\(\), routeDeadlineMs\)/)
  assert.match(route, /\.abortSignal\(routeDeadlineSignal\(routeDeadlineMs\)\)/)
  assert.match(route, /distilled_evaluation_route_deadline_exceeded/)
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
