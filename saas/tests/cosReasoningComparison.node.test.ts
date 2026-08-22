import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_REASONING_COMPARISON_CANDIDATES,
  MAX_REASONING_COMPARISON_CASES,
  MAX_REASONING_COMPARISON_EVALUATIONS,
  normalizeReasoningComparisonCandidates,
  summarizeReasoningComparison,
} from '../lib/ai/cos/reasoningComparison.ts'

test('controlled comparisons are bounded to two candidates and one held-out case', () => {
  assert.equal(MAX_REASONING_COMPARISON_CANDIDATES, 2)
  assert.equal(MAX_REASONING_COMPARISON_CASES, 1)
  assert.equal(MAX_REASONING_COMPARISON_EVALUATIONS, 2)
})

test('two distinct valid worker roles become deterministic candidate ids', () => {
  assert.deepEqual(normalizeReasoningComparisonCandidates(['primary', 'coder']), [
    { id: 'primary-1', workerRole: 'primary' },
    { id: 'coder-2', workerRole: 'coder' },
  ])
})

test('invalid, duplicate, or incomplete candidates fail closed', () => {
  assert.throws(() => normalizeReasoningComparisonCandidates(['primary']), /exactly 2 worker roles/)
  assert.throws(() => normalizeReasoningComparisonCandidates(['primary', 'primary']), /different worker roles/)
  assert.throws(() => normalizeReasoningComparisonCandidates(['primary', 'claude']), /must be one of/)
})

test('summary counts only durable verified outcomes as learning evidence', () => {
  const summary = summarizeReasoningComparison([
    { candidateId: 'primary-1', passed: true, verifiedOutcomeRecorded: true },
    { candidateId: 'coder-2', passed: false, verifiedOutcomeRecorded: true },
    { candidateId: 'coder-2', passed: true, verifiedOutcomeRecorded: false },
  ])
  assert.equal(summary.attempted, 3)
  assert.equal(summary.verified, 2)
  assert.equal(summary.passed, 1)
  assert.deepEqual(summary.byCandidate, [
    { candidateId: 'primary-1', attempted: 1, verified: 1, passed: 1 },
    { candidateId: 'coder-2', attempted: 2, verified: 1, passed: 0 },
  ])
})
