import assert from 'node:assert/strict'
import test from 'node:test'
import { MINIMUM_SOURCE_CONFIDENCE, REOPEN_LIMIT, assessDormantQuestion, isReopenable, scanKnowledgeApplication, selectReopenBatch, summarizeApplicationScan } from '../lib/ai/cos/knowledgeApplicationScan.ts'

const RETIRED_AT = '2026-08-01T00:00:00.000Z'
const AFTER = '2026-08-15T00:00:00.000Z'
const BEFORE = '2026-07-01T00:00:00.000Z'
const retiredGap = { id: 'gap-1', subject: 'postgres connection pool exhaustion', question: 'What verified knowledge would let COS diagnose postgres connection pool exhaustion under multi-tenant load?', status: 'retired', autopsyVerdict: 'unacquirable', autopsyAt: RETIRED_AT, lastSeenAt: RETIRED_AT, attemptCount: 5, reopenedCount: 0 }
const matchingRecord = { contentHash: 'hash-1', subject: 'postgres connection pool exhaustion', summary: 'Operational guidance on diagnosing pooler saturation, pgbouncer transaction mode, and multi-tenant load patterns that exhaust postgres backends.', sourceKind: 'official_documentation', sourceTitle: 'Diagnosing postgres pooler saturation', observedAt: AFTER, createdAt: AFTER, confidence: 0.86 }

test('new evidence about the retired subject reopens the question for a retest', () => {
  const candidate = assessDormantQuestion(retiredGap, [matchingRecord])
  assert.equal(candidate.verdict, 'reopen_and_retest'); assert.equal(candidate.contentHash, 'hash-1'); assert.ok(candidate.matchedTerms.includes('postgres')); assert.ok(candidate.coverage > 0)
})
test('evidence that predates retirement never reopens', () => assert.equal(assessDormantQuestion(retiredGap, [{ ...matchingRecord, observedAt: BEFORE, createdAt: BEFORE }]).verdict, 'evidence_predates_failure'))
test('malformed and unstudyable questions cannot be revived', () => {
  assert.equal(isReopenable({ ...retiredGap, autopsyVerdict: 'malformed' }), false)
  assert.equal(assessDormantQuestion({ ...retiredGap, autopsyVerdict: 'malformed' }, [matchingRecord]).verdict, 'not_reopenable')
  assert.equal(assessDormantQuestion({ ...retiredGap, status: 'unstudyable', autopsyVerdict: null }, [matchingRecord]).verdict, 'not_reopenable')
})
test('failed gaps still inside the normal study window are not reopened', () => assert.equal(isReopenable({ ...retiredGap, status: 'failed', autopsyAt: null }), false))
test('low-confidence and unanchored evidence are rejected', () => {
  assert.equal(assessDormantQuestion(retiredGap, [{ ...matchingRecord, confidence: MINIMUM_SOURCE_CONFIDENCE - 0.05 }]).verdict, 'source_confidence_too_low')
  const candidate = assessDormantQuestion(retiredGap, [{ ...matchingRecord, contentHash: 'hash-2', subject: 'multi-tenant billing reconciliation', sourceTitle: 'Tenant load reporting', summary: 'How multi-tenant load reporting is reconciled across billing periods for enterprise accounts.' }])
  assert.equal(candidate.verdict, 'insufficient_overlap'); assert.match(candidate.rationale, /subject/)
})
test('thin evidence and exhausted reopens do not requeue', () => {
  assert.equal(assessDormantQuestion(retiredGap, [{ ...matchingRecord, contentHash: 'hash-3', subject: 'postgres', sourceTitle: 'postgres release notes', summary: 'postgres release notes covering packaging changes.' }]).verdict, 'insufficient_overlap')
  assert.equal(assessDormantQuestion({ ...retiredGap, reopenedCount: REOPEN_LIMIT }, [matchingRecord]).verdict, 'reopen_limit_reached')
})
test('scan is bounded, deterministic, and never resolves a question', () => {
  const gaps = Array.from({ length: 6 }, (_, index) => ({ ...retiredGap, id: `gap-${index}` }))
  const candidates = scanKnowledgeApplication(gaps, [matchingRecord]); const batch = selectReopenBatch(candidates)
  assert.equal(batch.length, 3); assert.equal(new Set(batch.map(item => item.gapId)).size, 3); assert.ok(batch.every(item => item.verdict === 'reopen_and_retest'))
  const summary = summarizeApplicationScan([candidates[0], assessDormantQuestion({ ...retiredGap, id: 'malformed', autopsyVerdict: 'malformed' }, [matchingRecord])])
  assert.equal(summary.reopen_and_retest, 1); assert.equal(summary.not_reopenable, 1)
  for (const candidate of candidates) assert.ok(!/resolved|answered/.test(candidate.verdict))
})
