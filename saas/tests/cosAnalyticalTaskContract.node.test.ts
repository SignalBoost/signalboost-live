import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { requestedAnalyticalTasks, missingAnalyticalTasks, analyticalTaskRepairDirective } from '../lib/ai/cos/answerTaskContract.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')
const incomplete = 'To answer it properly I need readings and baseline values. I cannot stand behind a single cause.'

test('exact payment incident derives eight deliverables without hardcoded payment logic', () => {
  assert.equal(requestedAnalyticalTasks(incident).length, 8)
  assert.equal(missingAnalyticalTasks(incident, incomplete).length, 8)
  assert.match(analyticalTaskRepairDirective(incident, incomplete), /full ORIGINAL request/)
})

test('a structurally complete eight-part report meets the enumerated contract', () => {
  const answer = requestedAnalyticalTasks(incident).map((task, index) =>
    (index + 1) + '. ' + task + '\n' + 'Each working hypothesis is linked to relevant observations, an alternative explanation, a discriminating check, and what cannot be concluded without incident records.'
  ).join('\n')
  assert.deepEqual(missingAnalyticalTasks(incident, answer), [])
})

test('headings without content do not satisfy the task contract', () => {
  const headings = requestedAnalyticalTasks(incident).map((task, i) => (i + 1) + '. ' + task).join('\\n')
  assert.equal(missingAnalyticalTasks(incident, headings).length, 8)
})

test('unseen database incident follows the same contract', () => {
  const prompt = `A PostgreSQL database grows 40% overnight; disk I/O doubled.
1. List possible sources of growth.
2. Rank the explanations by likelihood.
3. Describe the evidence needed.
4. Design experiments to distinguish hypotheses.
5. Explain the most likely mechanism.`
  assert.equal(requestedAnalyticalTasks(prompt).length, 5)
  assert.equal(missingAnalyticalTasks(prompt, 'Please send me more readings first.').length, 5)
})

test('ordinary coding and prose requests do not create an analytical acceptance checklist', () => {
  assert.deepEqual(requestedAnalyticalTasks('Fix src/login.ts and run npm test.'), [])
  assert.deepEqual(requestedAnalyticalTasks('Write a Node.js calculator with two files.'), [])
  assert.deepEqual(missingAnalyticalTasks('Explain what Kafka is.', 'Kafka is an event streaming platform.'), [])
})
