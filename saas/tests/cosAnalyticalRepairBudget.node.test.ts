import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
test('the analytical first draft leaves a bounded recovery window', () => {
  // #4897: the analytical draft runs inside the shared turn deadline; the extra 25 s cap forced rescue calls.
  assert.match(reasoner, /const first = await recorder\.time\('draft', \(\) => callLocalModel\(effectiveArgs, boundedInference\(\)\)/)
  assert.doesNotMatch(reasoner, /Math\.min\(25_000, boundedInference\(\)\.timeoutMs\)/)
})
test('detected missing deliverables admit bounded repair despite conservative hardware estimates', () => {
  assert.match(reasoner, /firstTaskGaps\.length > 0 && remainingMs\(budget\) >= 8_000/)
  assert.match(reasoner, /Independently verified missing deliverables:/)
  assert.match(reasoner, /const firstOutcome = firstParsedForPolicy \? await outcomeOf/)
})
test('unseen numbered analytical work gets the recovery reserve', () => {
  assert.equal(requestedAnalyticalTasks('Investigate a service problem.\n1. List plausible explanations.\n2. Rank hypotheses.\n3. Design confirmation experiments.').length,3)
  assert.deepEqual(requestedAnalyticalTasks('What is a queue?'),[])
})
