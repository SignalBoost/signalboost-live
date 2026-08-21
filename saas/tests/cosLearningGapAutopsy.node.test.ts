//
// Before this, markQueuedReasoningGaps() wrote status='failed' and nothing else, and the next cycle
// re-selected ['pending','failed']. A gap that had failed twelve times got the same study slot and
// the same acquisition query as one failing its first. These tests pin the judgement that turns that
// infinite retry into a decision — and, just as importantly, pin the cases where it must NOT retire
// a gap.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MINIMUM_ATTEMPTS_BEFORE_TERMINAL,
  autopsyGap,
  autopsyGaps,
  isStudyableGap,
} from '../lib/ai/cos/learningGapAutopsy.ts'

const studyable = {
  id: 'g1',
  subject: 'postgres connection pool exhaustion',
  question: 'How should connection pool exhaustion be diagnosed in a multi-tenant deployment?',
  capability: 'software_engineering',
}

function attempts(reason: string, count: number) {
  return Array.from({ length: count }, () => ({ reason, at: '2026-08-21T00:00:00.000Z' }))
}

test('a young failure is retried, never retired', () => {
  const finding = autopsyGap({ ...studyable, attemptCount: 2, attempts: attempts('no sources found', 2) })
  assert.equal(finding.verdict, 'retry')
  assert.equal(finding.terminal, false)
})

test('repeated failure to find any material retires the gap as unacquirable', () => {
  const finding = autopsyGap({
    ...studyable,
    attemptCount: MINIMUM_ATTEMPTS_BEFORE_TERMINAL + 2,
    attempts: attempts('no sources found for subject', MINIMUM_ATTEMPTS_BEFORE_TERMINAL + 2),
  })
  assert.equal(finding.verdict, 'unacquirable')
  assert.equal(finding.terminal, true)
  assert.match(finding.rationale, /nothing reachable covers it|no source material/)
  // The decision must be auditable, not taken on trust.
  assert.ok(finding.attemptCount >= MINIMUM_ATTEMPTS_BEFORE_TERMINAL)
  assert.ok(finding.dominantReason)
})

test('transient failures NEVER retire a studyable gap, however many there are', () => {
  // Retiring a good subject because an adapter timed out would permanently discard it.
  for (const reason of ['request timeout', 'rate limit 429', 'fetch failed', 'GDELT unavailable']) {
    const finding = autopsyGap({ ...studyable, attemptCount: 20, attempts: attempts(reason, 20) })
    assert.equal(finding.verdict, 'retry', `expected "${reason}" to stay retryable`)
    assert.equal(finding.terminal, false)
  }
})

test('a mix of transient and real failures is not excused as transient', () => {
  const finding = autopsyGap({
    ...studyable,
    attemptCount: 6,
    attempts: [...attempts('request timeout', 3), ...attempts('no sources found', 3)],
  })
  assert.equal(finding.terminal, true)
})

test('a gap that is not a studyable question is malformed, and terminal immediately', () => {
  // No acquisition strategy can help, so attempt count is irrelevant.
  const finding = autopsyGap({ id: 'g2', subject: 'stuff', question: 'why?', attemptCount: 1 })
  assert.equal(finding.verdict, 'malformed')
  assert.equal(finding.terminal, true)
})

test('malformed and unacquirable stay distinguishable — they need different fixes', () => {
  const malformed = autopsyGap({ id: 'a', subject: 'x', question: 'huh', attemptCount: 9 })
  const unacquirable = autopsyGap({ ...studyable, attemptCount: 9, attempts: attempts('no results', 9) })
  assert.notEqual(malformed.verdict, unacquirable.verdict)
})

test('studyability accepts a real subject and rejects fragments', () => {
  assert.equal(isStudyableGap(studyable), true)
  assert.equal(isStudyableGap({ subject: 'worse president times', question: 'hm' }), false)
  assert.equal(isStudyableGap({ subject: '', question: '' }), false)
})

test('attempt count survives being recorded in any of the three places', () => {
  // repeated_count, attempt_count, or the length of the attempts array — whichever is highest wins,
  // so a column added later cannot silently reset a gap's history to zero.
  const finding = autopsyGap({ ...studyable, repeatedCount: 7, attemptCount: 0, attempts: [] })
  assert.equal(finding.attemptCount, 7)
})

test('a batch splits into retry and terminal without losing anyone', () => {
  const batch = autopsyGaps([
    { ...studyable, id: 'young', attemptCount: 1 },
    { ...studyable, id: 'old', attemptCount: 9, attempts: attempts('no sources found', 9) },
    { id: 'junk', subject: 'x', question: 'y', attemptCount: 1 },
  ])
  assert.equal(batch.considered, 3)
  assert.equal(batch.retry.length + batch.terminal.length, 3)
  assert.equal(batch.byVerdict.retry, 1)
  assert.equal(batch.byVerdict.unacquirable, 1)
  assert.equal(batch.byVerdict.malformed, 1)
})
