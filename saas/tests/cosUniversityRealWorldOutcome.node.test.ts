import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { evaluateRealWorldLearningEvidence } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const completeEvidence = {
  baselineScore: 55,
  postStudyScore: 84,
  transferEvidenceRefs: ['exam://unseen-transfer/1'],
  practicalEvidenceRefs: ['production://task/1'],
  delayedRetentionEvidenceRefs: ['exam://retention/1'],
  sourceEvidenceRefs: ['source://verified/1'],
  productionOutcome: { baseline: 0.61, candidate: 0.82, higherIsBetter: true, sampleSize: 40 },
  independentScorer: true,
} as const

test('complete real-world evidence is eligible for promotion', () => {
  const result = evaluateRealWorldLearningEvidence(completeEvidence)
  assert.equal(result.promotionEligible, true)
})

test('real-world outcome fails closed when independent retention or improvement is missing', () => {
  const result = evaluateRealWorldLearningEvidence({
    ...completeEvidence,
    delayedRetentionEvidenceRefs: [],
    productionOutcome: { ...completeEvidence.productionOutcome, candidate: 0.5 },
  })
  assert.equal(result.promotionEligible, false)
})

test('real-world outcomes use the append-only assurance ledger and independent verifier', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityRealWorldOutcome.ts'), 'utf8')
  assert.match(source, /event_type:\s*'learning_outcome'/)
  assert.match(source, /candidate_id:\s*agentId/)
  assert.match(source, /independentScorer \? 'independent_scorer' : 'host_controller'/)
  assert.match(source, /cleanIdentity\(input\.agentId, 'agent_id'\)/)
  assert.doesNotMatch(source, /\.update\(\{|\.delete\(/)
})
