import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('independent evaluation proves exact RunPod readiness before every inference POST', () => {
  assert.match(route, /RUNPOD_READY_TIMEOUT_MS = 220_000/)
  assert.match(route, /RUNPOD_READY_POLL_MS = 3_000/)
  assert.match(route, /RUNPOD_ENDPOINT_HOST = \/\^\[A-Za-z0-9_-\]/)
  assert.match(route, /url\.pathname === '\/v1\/chat\/completions'/)
  assert.match(route, /if \(isRunpodEvaluationInference\(url, init\)\) \{\s*await proveRunpodReady\(\{ origin: url\.origin, originalFetch \}\)\s*\}/)
  assert.doesNotMatch(route, /warmedRunpodOrigins/)
})

test('runtime readiness uses non-inference GET probes and requires HTTP 200', () => {
  assert.match(route, /input\.originalFetch\(`\$\{input\.origin\}\/ready`/)
  assert.match(route, /headers: \{ Authorization: `Bearer \$\{key\}` \}/)
  assert.match(route, /if \(response\.status === 200\) return/)
  assert.doesNotMatch(route, /proveRunpodReady[\s\S]*?\/v1\/chat\/completions[\s\S]*?originalFetch/)
})

test('runtime readiness fails closed on bootstrap failure or deadline without retrying inference', () => {
  assert.match(route, /detail\.includes\('distilled_bootstrap_failed'\)/)
  assert.match(route, /distilled_evaluation_runtime_bootstrap_failed/)
  assert.match(route, /distilled_evaluation_runtime_not_ready:/)
  assert.match(route, /Math\.min\(15_000, remaining\)/)
})

test('evaluation duration covers bounded cold boot plus four suites', () => {
  assert.match(route, /export const maxDuration = 600/)
})
