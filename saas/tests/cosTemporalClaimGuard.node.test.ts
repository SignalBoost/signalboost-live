// saas/tests/cosTemporalClaimGuard.node.test.ts
//
// Built from a real production failure (2026-08-21). Asked "when did George Foreman die", COS
// replied "George Foreman is not dead; he is still alive. As of 2024, ..." — Foreman died on
// 21 March 2025. A confident, uncited, checkable falsehood about a real person, with the model's
// training cutoff narrated as the present day.
//
// These tests pin the guard, and pin equally hard that it must NOT fire on ordinary questions —
// a guard that abstains everywhere is as useless as one that never fires.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EVIDENCE_FRESHNESS_DAYS,
  assessTemporalAnswer,
  classifyTemporalSensitivity,
} from '../lib/ai/cos/temporalClaimGuard.ts'

const NOW = new Date('2026-08-21T00:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

test('the exact production question is flagged as time-sensitive', () => {
  const classification = classifyTemporalSensitivity('when did george foreman die')
  assert.equal(classification.sensitive, true)
  assert.equal(classification.kind, 'life_status')
})

test('natural and imperfect life-status wording is also flagged', () => {
  assert.equal(classifyTemporalSensitivity('when Hulk Hogan died?').kind, 'life_status')
  assert.equal(classifyTemporalSensitivity('Has Hulk Hogan died?').kind, 'life_status')
  assert.equal(classifyTemporalSensitivity('Is Hulk Hogan alive?').kind, 'life_status')
})

test('the exact production answer is caught — twice over', () => {
  const verdict = assessTemporalAnswer(
    'when did george foreman die',
    'George Foreman is not dead; he is still alive. As of 2024, the former heavyweight boxing champion is in his mid-70s and continues to be active in public life.',
    { citedCount: 0 },
    NOW,
  )
  assert.equal(verdict.violation, true)
  // The stale anchor is caught first because it is unambiguous evidence of cutoff-as-present.
  assert.equal(verdict.code, 'stale_as_of_anchor')
  assert.match(verdict.reason, /training cutoff/)
  assert.ok(verdict.suggestedAbstention.length > 0)
})

test('a stale "as of" anchor is a violation even on a non-sensitive question', () => {
  const verdict = assessTemporalAnswer('explain indexing', 'As of 2024, B-trees are common.', { citedCount: 3, freshestEvidenceAt: daysAgo(1) }, NOW)
  assert.equal(verdict.violation, true)
  assert.equal(verdict.code, 'stale_as_of_anchor')
})

test('"as of" the current year is not a violation', () => {
  const verdict = assessTemporalAnswer('explain indexing', 'As of 2026, B-trees are common.', { citedCount: 2, freshestEvidenceAt: daysAgo(2) }, NOW)
  assert.equal(verdict.violation, false)
})

test('a time-sensitive question with no cited evidence must abstain', () => {
  const verdict = assessTemporalAnswer('is Acme still supported', 'Yes, Acme is still supported.', { citedCount: 0 }, NOW)
  assert.equal(verdict.violation, true)
  assert.equal(verdict.code, 'unsupported_present_claim')
  assert.match(verdict.suggestedAbstention, /current status/)
})

test('stale evidence cannot support a present-tense claim', () => {
  const verdict = assessTemporalAnswer(
    'who is the current CEO',
    'The current CEO is Jane Doe.',
    { citedCount: 4, freshestEvidenceAt: daysAgo(EVIDENCE_FRESHNESS_DAYS + 30) },
    NOW,
  )
  assert.equal(verdict.violation, true)
  assert.match(verdict.reason, /days old/)
})

test('fresh cited evidence permits the claim — the guard is not a blanket refusal', () => {
  const verdict = assessTemporalAnswer(
    'who is the current CEO',
    'The current CEO is Jane Doe [EM1].',
    { citedCount: 1, freshestEvidenceAt: daysAgo(10) },
    NOW,
  )
  assert.equal(verdict.violation, false)
  assert.equal(verdict.code, 'ok')
})

test('ordinary technical questions are never flagged', () => {
  // A guard that fires everywhere would make COS useless and get switched off.
  for (const prompt of [
    'explain how connection pooling works',
    'what causes p95 latency to rise when CPU is flat',
    'describe the difference between Enterprise Memory and Semantic Cache',
    'write a migration to add an index',
  ]) {
    assert.equal(classifyTemporalSensitivity(prompt).sensitive, false, `should not flag: ${prompt}`)
  }
})

test('each sensitive kind is recognised', () => {
  assert.equal(classifyTemporalSensitivity('is he still alive?').kind, 'life_status')
  assert.equal(classifyTemporalSensitivity('who is the current president of the company').kind, 'current_holder')
  assert.equal(classifyTemporalSensitivity('is that library still maintained').kind, 'ongoing_status')
  assert.equal(classifyTemporalSensitivity('what is the latest version of Postgres').kind, 'latest_version')
  assert.equal(classifyTemporalSensitivity('what happened this month').kind, 'recent_event')
})

test('the abstention names the limitation instead of guessing', () => {
  const verdict = assessTemporalAnswer('is George Foreman still alive', 'Yes.', { citedCount: 0 }, NOW)
  assert.match(verdict.suggestedAbstention, /cannot confirm/)
  // It must not contain an assertion either way.
  assert.ok(!/\bis alive\b|\bis dead\b/.test(verdict.suggestedAbstention))
})
