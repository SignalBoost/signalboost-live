import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVIDENCE_FRESHNESS_DAYS,
  assessTemporalAnswer,
  classifyTemporalSensitivity,
} from '../lib/ai/cos/temporalClaimGuard.ts'

const NOW = new Date('2026-08-22T00:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

test('life/death wording is treated as one temporal class, including natural grammar variants', () => {
  for (const prompt of [
    'when did george foreman die',
    'when Hulk Hogan died?',
    'is this person still alive?',
    'has the actor passed away?',
    'what was the cause of death?',
  ]) {
    const classification = classifyTemporalSensitivity(prompt)
    assert.equal(classification.sensitive, true, prompt)
    assert.equal(classification.kind, 'life_status', prompt)
  }
})

test('stale cutoff-style as-of year is caught before it can masquerade as current knowledge', () => {
  const verdict = assessTemporalAnswer(
    'when did this public figure die',
    'The person is not dead. As of 2024, they remain active.',
    { citedCount: 0, independentSourceCount: 0 },
    NOW,
  )
  assert.equal(verdict.violation, true)
  assert.equal(verdict.code, 'stale_as_of_anchor')
  assert.match(verdict.reason, /stale model knowledge/i)
})

test('life/death fact can be accepted after live independent corroboration even if original reports are older', () => {
  const verdict = assessTemporalAnswer(
    'when did this public figure die',
    'The person died on the reported date. [LIVE1] [LIVE2]',
    { citedCount: 2, independentSourceCount: 2, freshestEvidenceAt: daysAgo(EVIDENCE_FRESHNESS_DAYS + 365) },
    NOW,
  )
  assert.equal(verdict.violation, false)
  assert.equal(verdict.code, 'ok')
})

test('time-sensitive present-state question with no evidence must abstain', () => {
  const verdict = assessTemporalAnswer('is Acme still supported', 'Yes, Acme is still supported.', { citedCount: 0 }, NOW)
  assert.equal(verdict.violation, true)
  assert.equal(verdict.code, 'unsupported_present_claim')
})

test('stale dated evidence cannot support a mutable present-state claim', () => {
  const verdict = assessTemporalAnswer(
    'who is the current CEO',
    'The current CEO is Jane Doe.',
    { citedCount: 2, independentSourceCount: 2, freshestEvidenceAt: daysAgo(EVIDENCE_FRESHNESS_DAYS + 30) },
    NOW,
  )
  assert.equal(verdict.violation, true)
})

test('fresh cited evidence permits a mutable present-state claim', () => {
  const verdict = assessTemporalAnswer(
    'who is the current CEO',
    'The current CEO is Jane Doe [LIVE1].',
    { citedCount: 1, independentSourceCount: 1, freshestEvidenceAt: daysAgo(10) },
    NOW,
  )
  assert.equal(verdict.violation, false)
  assert.equal(verdict.code, 'ok')
})

test('general temporal classes cover roles, ongoing state, releases, rules, security and recent events', () => {
  const cases: Array<[string, string]> = [
    ['who is the current president of the company', 'current_holder'],
    ['is that library still maintained', 'ongoing_status'],
    ['what is the latest version of Postgres', 'latest_state'],
    ['what is the current visa requirement', 'current_rule'],
    ['is CVE-2026-12345 still unpatched', 'current_security'],
    ['what happened this month', 'recent_event'],
  ]
  for (const [prompt, kind] of cases) {
    assert.equal(classifyTemporalSensitivity(prompt).kind, kind, prompt)
  }
})

test('ordinary timeless technical and creative questions are never flagged', () => {
  for (const prompt of [
    'explain how connection pooling works',
    'what causes p95 latency to rise when CPU is flat',
    'describe the difference between Enterprise Memory and Semantic Cache',
    'write a migration to add an index',
    'how should I market my latest product?',
  ]) {
    assert.equal(classifyTemporalSensitivity(prompt).sensitive, false, `should not flag: ${prompt}`)
  }
})
