import assert from 'node:assert/strict'
import test from 'node:test'
import { missingAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const prompt = [
  '1. Identify plausible root causes.',
  '2. Describe possible interacting failure mechanisms.',
  '3. Rank the hypotheses with explanations.',
].join('\n')
const substantial = 'The queue worker owns claims, while the continuation cron reconciles leased attempts. A missing heartbeat distinguishes an abandoned lease from an active worker. Compare claim generation, checkpoint records, recent run receipts, and transaction errors before changing status.'
const alternate = 'First investigate the recorded heartbeat and accepted lease. Then inspect the database state transitions, operator dispatch logs, run attempts, and errors, cross-checking the timestamps to establish whether campaign execution continued after the queue claim.'

test('a substantive append repairs an initially incomplete numbered deliverable', () => {
  const first = [
    '1. Root causes',
    '2. Interactions',
    '3. Hypothesis ranking',
  ].join('\n')
  const repaired = first + '\n\n' + [
    '1. ' + substantial,
    '2. ' + alternate,
    '3. ' + substantial.replace('queue worker', 'model execution harness') + ' ' + alternate,
  ].join('\n\n')
  assert.equal(missingAnalyticalTasks(prompt, first).length, 3)
  assert.deepEqual(missingAnalyticalTasks(prompt, repaired), [])
})

test('repeated checklist labels and generic prose do not become substantive', () => {
  const empty = [
    '1. Identify plausible root causes.',
    '2. Describe possible interacting failure mechanisms.',
    '3. Rank the hypotheses with explanations.',
    '1. Identify plausible root causes.',
    '2. Describe possible interacting failure mechanisms.',
    '3. Rank the hypotheses with explanations.',
  ].join('\n')
  assert.equal(missingAnalyticalTasks(prompt, empty).length, 3)
})
