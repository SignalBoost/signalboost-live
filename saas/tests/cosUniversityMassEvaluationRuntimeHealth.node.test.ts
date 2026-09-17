import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helper = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRuntimeHealth.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('runtime health evidence is captured only for candidate 502/503/504 failures', () => {
  assert.match(helper, /runpod_http_\(502\|503\|504\):candidate:/)
  assert.match(helper, /massDistilledRuntimeHealth/)
  assert.doesNotMatch(helper, /\/ready|chat\/completions|canaryMassDistilledRuntime/)
})

test('runtime health evidence adds no inference call, wake authority, or traffic authority', () => {
  assert.match(helper, /inferenceCallsAdded: 0/)
  assert.match(helper, /runtimeWakeAttemptsAdded: 0/)
  assert.match(helper, /productionTrafficAuthorized: false/)
  assert.match(helper, /authorityExpanded: false/)
})

test('mass evaluator persists the health snapshot in terminal and production evidence', () => {
  assert.match(route, /captureMassEvaluationRuntimeHealth/)
  assert.match(route, /runtimeHealthEvidence/)
  assert.match(route, /evidence: \{ error: clean\(message, 500\), \.\.\.\(runtimeHealthEvidence \? \{ runtimeHealthEvidence \} : \{\}\) \}/)
  assert.match(route, /runtimeHealthEvidence \? \{ runtimeHealthEvidence \} : \{\}/)
})
