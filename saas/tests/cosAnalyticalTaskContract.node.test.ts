import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('exact payment incident derives eight deliverables without hardcoded payment logic', () => {
  assert.equal(requestedAnalyticalTasks(incident).length, 8)
})

test('unseen database incident follows the same contract', () => {
  const prompt = `A PostgreSQL database grows 40% overnight; disk I/O doubled.
1. List possible sources of growth.
2. Rank the explanations by likelihood.
3. Describe the evidence needed.
4. Design experiments to distinguish hypotheses.
5. Explain the most likely mechanism.`
  assert.equal(requestedAnalyticalTasks(prompt).length, 5)
})

test('Q10: the word-count completion check is deleted; the verifier alone judges deliverables', () => {
  const contract = readFileSync(new URL('../lib/ai/cos/answerTaskContract.ts', import.meta.url), 'utf8')
  const envelope = readFileSync(new URL('../lib/ai/cos/cosExecutionEnvelope.ts', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(contract, /missingAnalyticalTasks|analyticalTaskRepairDirective|topicWords/)
  assert.doesNotMatch(envelope, /cosAnswerProgress|missingAnalyticalTasks/)
  assert.match(source, /const firstOutcome = firstParsedForPolicy \? await outcomeOf/)
})

test('analytical no-draft recovery is bounded and uses original request', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /!initialDraft && analyticalTasks\.length > 0 && remainingMs\(budget\) >= 8_000/)
  assert.match(reasoner, /analytical_no_draft_recovery/)
  assert.match(reasoner, /args\.prompt,[\s\S]*?Complete the ORIGINAL analytical assignment now/)
  assert.match(reasoner, /if \(!initialDraft\) \{[\s\S]*?return null/)
})

test('ordinary coding and prose requests do not create an analytical acceptance checklist', () => {
  assert.deepEqual(requestedAnalyticalTasks('Fix src/login.ts and run npm test.'), [])
  assert.deepEqual(requestedAnalyticalTasks('Write a Node.js calculator with two files.'), [])
})
