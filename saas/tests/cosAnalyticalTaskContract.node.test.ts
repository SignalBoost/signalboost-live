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

test('eight substantively distinct incident sections pass the contract', () => {
  const details = [
    'Likely causes include consumer replay during partition reassignments and accounting double counting even when primary keys remain unique. Compare business payment identifiers.',
    'Rank redelivery plus insufficient payment idempotency first, reporting aggregation defects next, and a pure settlement cutoff mismatch third; this ranking is provisional.',
    'Kafka lag and pod restarts correlate in time but do not prove replay caused an inflated ledger. Confirm event identifiers and commit order before assigning causation.',
    'Missing evidence includes settlement identifiers, bank cutoff dates, raw Kafka offsets, restart reasons, source ledger writes, and complete unsampled transaction traces.',
    'Preserve immutable payment records, align timestamps and consumer rebalances, reconstruct one affected transaction from producer to bank settlement, and audit aggregations.',
    'Simulate a consumer interruption after ledger commit but before offset acknowledgement; verify that duplicate deliveries cannot create another accounting effect in staging.',
    'A restart can trigger replay while a stale Redis key bypasses deduplication; a reporting projection may then count two events though the processor settled one payment.',
    'The leading unverified mechanism is Kafka event redelivery interacting with inadequate business-level accounting idempotency. Verify with immutable settlement identifiers.',
  ]
  const answer = requestedAnalyticalTasks(incident).map((task, index) =>
    (index + 1) + '. ' + task + '\n' + details[index]
  ).join('\n')
  assert.deepEqual(missingAnalyticalTasks(incident, answer), [])
})

test('eight copied generic paragraphs are not eight completed investigations', () => {
  const generic = 'Each working hypothesis is linked to observations, alternative explanations, a discriminating check, and what cannot be concluded without operational records and end-to-end event traces.'
  const answer = requestedAnalyticalTasks(incident).map((task, index) =>
    (index + 1) + '. ' + task + '\n' + generic
  ).join('\n')
  assert.ok(missingAnalyticalTasks(incident, answer).length >= 7)
})

test('headings without content do not satisfy the task contract', () => {
  const headings = requestedAnalyticalTasks(incident).map((task, i) => (i + 1) + '. ' + task).join('\n')
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
