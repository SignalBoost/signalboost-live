// saas/tests/cosSubstantiveAnalysisRelease.node.test.ts
// Production 2026-10-25: complete model answers (finish_reason stop, 1,000-3,140 tokens) to the 8-task incident
// analysis were discarded because the section parser reported gaps, and the owner got "I could not complete the
// requested analytical deliverables". A non-answer is still withheld; a substantive analysis is released.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { missingAnalyticalTasks, releasableAnalyticalAnswer } from '../lib/ai/cos/answerTaskContract.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

// A real-shaped analysis: grouped sections with nested numbered lists, as models commonly write them.
const analysis = `## 1. Plausible root causes
1. Kafka consumer replay after the pod restart: offsets committed after processing are lost when the pod dies, so the batch is reprocessed.
2. Non-idempotent revenue aggregation: the reporting job sums events, so a replayed event counts twice although PostgreSQL rejects the duplicate key.
3. Redis cache serving stale aggregates: the hit-rate jump to 99% suggests a cache warm from a replayed or frozen key set.
4. Transaction ID generator reuse after restart: a sequence seeded from time could repeat every restart cycle.

## 2. Ranking by probability
Kafka replay plus non-idempotent aggregation is most probable, because the 16–20 hour pod restart matches the 18 hour duplicate interval and lag spikes precede each discrepancy. Stale Redis aggregates rank second; ID reuse third; a reporting formula bug last.

## 3. Correlation versus causation
The restart cadence and duplicate cadence correlate tightly; causation requires showing replayed offsets. The cache hit-rate jump correlates with incidents but is likely an effect of replayed reads rather than a cause.

## 4. Missing evidence
Unsampled consumer logs around restarts, committed offset history per partition, the reporting query, Redis key TTLs and the ID generator seed.

## 5. Forensic investigation plan
Align restart timestamps with lag spikes and duplicate IDs; export committed offsets; diff report totals against settled deposits per hour; capture full logs for one restart window.

## 6. Experiments
Kill the pod deliberately in staging and count replayed events; make aggregation idempotent on transaction ID and compare totals; disable the cache for one cycle.

## 7. How faults combine
A restart replays uncommitted messages, the aggregator double-counts them, and the cache then serves the inflated aggregate, so revenue exceeds deposits without duplicate primary keys.

## 8. Most likely explanation
Consumer replay after the periodic pod restart, counted twice by non-idempotent revenue aggregation.`

test('a substantive analysis with nested lists is parsed as complete and released', () => {
  assert.deepEqual(missingAnalyticalTasks(incident, analysis), [], 'nested lists must not be mistaken for top-level tasks')
  assert.equal(releasableAnalyticalAnswer(incident, analysis), true)
})

test('a non-answer is never released', () => {
  for (const reply of [
    'I need more readings before investigating.',
    'To answer it properly I need the readings that separate the candidate causes, and the normal or baseline values to compare against. I still cannot stand behind a single cause yet.',
  ]) assert.equal(releasableAnalyticalAnswer(incident, reply), false, reply)
})

// Codex on #4900: the checklist headings plus one refusal paragraph repeated under each must stay a non-answer.
test('repeated task headings with a repeated refusal under each are not substantive', async () => {
  const { requestedAnalyticalTasks } = await import('../lib/ai/cos/answerTaskContract.ts')
  const refusal = 'Without the consumer offsets, pod restart logs, cache metrics and reconciliation exports for the incident window I cannot responsibly say anything about this item; please provide that telemetry first, together with the baseline values for a normal day so the comparison is meaningful.'
  const padded = requestedAnalyticalTasks(incident).map((task, index) => `${index + 1}. ${task}\n${refusal}`).join('\n\n')
  assert.ok(padded.length > 2400, `${padded.length}`)
  assert.equal(releasableAnalyticalAnswer(incident, padded), false)
})

test('requests without enumerated deliverables are unaffected', () => {
  assert.equal(releasableAnalyticalAnswer('What is a message queue?', 'A message queue is asynchronous transport.'), true)
})

test('the reasoner and the primary route release by the same rule', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /remainingTaskGaps\.length && !\(finalParsedForPolicy && releasableAnalyticalAnswer\(effectiveArgs\.prompt, finalParsedForPolicy\.answer\)\)/)
  assert.match(reasoner, /repairedTaskGaps\.length < firstTaskGaps\.length/)
  assert.match(route, /missingAnalyticalTasks\(input,reply\)/)
  assert.match(route, /releasableAnalyticalAnswer\(input,reply\)/)
  assert.match(route, /releasableAnalyticalAnswer\(input,candidateReply\)/)
})
