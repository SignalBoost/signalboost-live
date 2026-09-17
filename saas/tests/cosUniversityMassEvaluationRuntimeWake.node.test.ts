import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('mass evaluation wakes the scaled-to-zero runtime through the vLLM load-balancer path', () => {
  assert.match(route, /runpodServerlessOpenAiBaseUrl/)
  assert.match(route, /\/models`/)
  assert.match(route, /tokenGeneratingRequest: false/)
  assert.match(route, /await wakeMassDistilledRuntime\(claim\.endpointId, deadlineMs\)/)
})

test('runtime wake remains separate from the approved scoring-call budget', () => {
  const wake = route.indexOf('await wakeMassDistilledRuntime(claim.endpointId, deadlineMs)')
  const evaluation = route.indexOf('await runMassDistilledArtifactEvaluation({ claim, deadlineMs, now: new Date() })')
  assert.ok(wake >= 0 && evaluation > wake)
  assert.match(route, /does not consume one of the\n    \/\/ eight approved scoring calls/)
})
