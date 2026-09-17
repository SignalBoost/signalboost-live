// saas/tests/cosUniversityMassEvaluationRuntimeWake.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('mass evaluation wakes the scaled-to-zero runtime through the vLLM load-balancer path', () => {
  assert.match(route, /runpodServerlessRootUrl\(endpointId\)\}\/ping`/)
  assert.doesNotMatch(route, /\/models`/)
  assert.match(route, /!== 'accepting_requests'/)
  assert.match(route, /modelReady: payload\?\.modelReady === true/)
  assert.doesNotMatch(route, /payload\.data\.length/)
  assert.match(route, /const RUNTIME_WAKE_TIMEOUT_MS = 20_000/)
  assert.match(route, /name !== 'TimeoutError' && name !== 'AbortError'/)
  assert.match(route, /wakeRequestTimedOut: true/)
  const gateway = fs.readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
  assert.match(gateway, /@app\.get\('\/ping'\)/)
  assert.doesNotMatch(gateway, /@app\.get\('\/v1\/models'\)/)
  assert.match(route, /tokenGeneratingRequest: false/)
  assert.match(route, /await wakeMassDistilledRuntime\(claim\.endpointId, deadlineMs\)/)
})

test('runtime wake remains separate from the approved scoring-call budget', () => {
  const wake = route.indexOf('await wakeMassDistilledRuntime(claim.endpointId, deadlineMs)')
  const evaluation = route.indexOf('await runMassDistilledArtifactEvaluation({ claim, deadlineMs, now: new Date() })')
  assert.ok(wake >= 0 && evaluation > wake)
  assert.match(route, /does not consume one of the\n    \/\/ eight approved scoring calls/)
})

test('an evaluator defect records its own throw site, without leaking provider or prompt content', () => {
  assert.match(route, /const frames = error instanceof Error/)
  assert.match(route, /line\.trim\(\)\.startsWith\('at '\)/)
  assert.match(route, /\.slice\(0, 4\)/)
  assert.match(route, /errorFrames: frames/)
  assert.match(route, /evidence: \{ error: clean\(message, 500\), \.\.\.\(frames\.length \? \{ errorFrames: frames \} : \{\}\) \}/)
})
