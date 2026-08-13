import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_COGNITIVE_PROMOTION_POLICY,
  evaluateCognitiveSkillEligibility,
} from '../lib/ai/cos/cognitiveLearningLifecycle'

const NOW = Date.parse('2026-08-13T05:00:00Z')
const RECENT = '2026-08-12T05:00:00Z'

function base(overrides: Partial<Parameters<typeof evaluateCognitiveSkillEligibility>[0]> = {}) {
  return {
    evaluatorApproved: false,
    understandingApproved: false,
    practiceAttempts: 0,
    practiceSuccesses: 0,
    holdoutAttempts: 0,
    holdoutSuccesses: 0,
    distinctHoldoutVariants: 0,
    productionAttempts: 0,
    productionSuccesses: 0,
    failureCount: 0,
    lastValidatedAt: null,
    quarantined: false,
    ...overrides,
  }
}

test('a teacher encounter cannot become learned merely because it was reviewed', () => {
  const result = evaluateCognitiveSkillEligibility(base({ evaluatorApproved: true }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'evaluated')
  assert.match(result.reasons.join(' '), /understanding/i)
})

test('understanding without practice remains understood', () => {
  const result = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'understood')
})

test('practice alone does not count as validation', () => {
  const result = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 4,
    practiceSuccesses: 4,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'practiced')
  assert.equal(result.practiceRate, 1)
})

test('held-out breadth can support learned status without changing answer confidence', () => {
  const result = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 5,
    practiceSuccesses: 4,
    holdoutAttempts: 7,
    holdoutSuccesses: 6,
    distinctHoldoutVariants: 6,
    lastValidatedAt: RECENT,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'learned')
  assert.ok((result.holdoutRate ?? 0) >= DEFAULT_COGNITIVE_PROMOTION_POLICY.minHoldoutRateForLearned)
})

test('mastery requires production evidence as well as held-out performance', () => {
  const withoutProduction = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 20,
    practiceSuccesses: 19,
    holdoutAttempts: 25,
    holdoutSuccesses: 24,
    distinctHoldoutVariants: 15,
    lastValidatedAt: RECENT,
  }), undefined, NOW)
  assert.equal(withoutProduction.recommendedStatus, 'learned')

  const mastered = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 20,
    practiceSuccesses: 19,
    holdoutAttempts: 25,
    holdoutSuccesses: 24,
    distinctHoldoutVariants: 15,
    productionAttempts: 8,
    productionSuccesses: 8,
    lastValidatedAt: RECENT,
  }), undefined, NOW)
  assert.equal(mastered.recommendedStatus, 'mastered')
})

test('stale validation prevents learned/mastered promotion until revalidated', () => {
  const result = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 20,
    practiceSuccesses: 20,
    holdoutAttempts: 25,
    holdoutSuccesses: 25,
    distinctHoldoutVariants: 20,
    productionAttempts: 10,
    productionSuccesses: 10,
    lastValidatedAt: '2026-01-01T00:00:00Z',
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'validated')
  assert.equal(result.validationFresh, false)
})

test('quarantine overrides positive evidence', () => {
  const result = evaluateCognitiveSkillEligibility(base({
    evaluatorApproved: true,
    understandingApproved: true,
    practiceAttempts: 100,
    practiceSuccesses: 100,
    holdoutAttempts: 100,
    holdoutSuccesses: 100,
    distinctHoldoutVariants: 100,
    productionAttempts: 100,
    productionSuccesses: 100,
    lastValidatedAt: RECENT,
    quarantined: true,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'quarantined')
})
