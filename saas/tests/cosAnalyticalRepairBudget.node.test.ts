import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
test('the analytical first draft leaves a bounded recovery window', () => {
  assert.match(reasoner, /requestedAnalyticalTasks\(effectiveArgs\.prompt\)\.length > 0/)
  assert.match(reasoner, /Math\.min\(25_000, boundedInference\(\)\.timeoutMs\)/)
})
test('detected missing deliverables admit bounded repair despite conservative hardware estimates', () => {
  assert.match(reasoner, /firstTaskGaps\.length > 0 && remainingMs\(budget\) >= 8_000/)
  assert.match(reasoner, /analyticalTaskRepairDirective\(effectiveArgs\.prompt, firstParsedForPolicy\.answer\)/)
})
test('unseen numbered analytical work gets the recovery reserve', () => {
  assert.equal(requestedAnalyticalTasks('Investigate a service problem.\n1. List plausible explanations.\n2. Rank hypotheses.\n3. Design confirmation experiments.').length,3)
  assert.deepEqual(requestedAnalyticalTasks('What is a queue?'),[])
})
