import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyTieredAdmission } from '../lib/ai/cos/tieredLearningAdmission'

test('high-confidence evidence is immediately eligible only at the strict thresholds', () => {
  const decision = classifyTieredAdmission({ rawRelevance: 0.85, confidence: 0.8, sourceFloor: 0.75, gapAligned: false })
  assert.equal(decision.tier, 'high_confidence')
  assert.equal(decision.corroborationRequired, false)
})

test('gap alignment creates a separate adjusted score without changing raw relevance', () => {
  const decision = classifyTieredAdmission({ rawRelevance: 0.64, confidence: 0.66, sourceFloor: 0.6, gapAligned: true })
  assert.equal(decision.rawRelevance, 0.64)
  assert.equal(decision.gapAdjustedRelevance, 0.74)
  assert.equal(decision.tier, 'probationary')
  assert.equal(decision.reason, 'gap_aligned_probationary')
})

test('non-gap probationary evidence requires corroboration', () => {
  const decision = classifyTieredAdmission({ rawRelevance: 0.73, confidence: 0.66, sourceFloor: 0.6, gapAligned: false })
  assert.equal(decision.tier, 'probationary')
  assert.equal(decision.corroborationRequired, true)
})

test('weak evidence is rejected rather than inflated into a probationary record', () => {
  const decision = classifyTieredAdmission({ rawRelevance: 0.69, confidence: 0.64, sourceFloor: 0.6, gapAligned: true })
  assert.equal(decision.tier, 'rejected')
  assert.equal(decision.rawRelevance, 0.69)
  assert.equal(decision.gapAdjustedRelevance, 0.79)
})
