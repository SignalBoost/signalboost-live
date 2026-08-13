import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateKnowledgePromotionRelevance } from '../lib/ai/cos/knowledgePromotionRelevance'

const options = { minSubjectMatches: 2, minSubjectCoverage: 0.3 }

test('Enterprise cybersecurity accepts a strong cybersecurity source without requiring generic enterprise repetition', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Enterprise cybersecurity',
    sourceTitle: 'Proactive identification of cybersecurity compromises',
    summary: 'A cybersecurity compromise assessment framework identifies defensive signals and compromised hosts.',
    confidence: 0.92,
  }, options)

  assert.equal(decision.eligible, true)
  assert.deepEqual(decision.discriminativeMatched, ['cybersecurity'])
})

test('generic-only database performance matches remain rejected', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Database and data-layer performance',
    sourceTitle: 'Clinical model performance study',
    summary: 'The diagnostic model reports improved performance across patient cohorts.',
    confidence: 0.92,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'insufficient_subject_overlap')
})
