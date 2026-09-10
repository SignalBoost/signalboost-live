import assert from 'node:assert/strict'
import test from 'node:test'
import { universityEvidenceFromVerifiedOutcome } from '../lib/ai/cos/cosUniversityOutcomeCorrelation.ts'

test('verified production outcome automatically becomes agent-scoped University evidence', () => {
  const sourceRef = 'vercel-deployment:dpl_ABC123:terminal'
  const academic = universityEvidenceFromVerifiedOutcome({
    agentId: 'software-specialist', subjectId: 'computer_science',
    baselineScore: 52, postStudyScore: 84,
    transferEvidenceRefs: ['exam://transfer/1'],
    delayedRetentionEvidenceRefs: ['exam://retention/1'],
    sourceEvidenceRefs: ['source://verified/1'],
    productionBaseline: 0.62, productionCandidate: 0.86,
    higherIsBetter: true, sampleSize: 30, independentScorer: true,
  }, {
    eligible: true, subject: 'incident diagnosis', experienceHash: 'a'.repeat(64),
    sourceClass: 'production_outcome', sourceRef, domain: 'self_healing',
    outcomeStatus: 'success', success: true, score: 1, evidence: {},
  })
  assert.equal(academic?.agentId, 'software-specialist')
  assert.equal(academic?.subjectId, 'computer_science')
  assert.deepEqual(academic?.evidence.practicalEvidenceRefs, [sourceRef])
  assert.equal(academic?.evidence.productionOutcome.candidate, 0.86)
})

test('ordinary verified outcomes do not manufacture University evidence', () => {
  const academic = universityEvidenceFromVerifiedOutcome(null, {
    eligible: true, subject: 'incident diagnosis', experienceHash: 'a'.repeat(64),
    sourceClass: 'production_outcome', sourceRef: 'production://task/1', domain: 'workflow',
    outcomeStatus: 'success', success: true, score: 1, evidence: {},
  })
  assert.equal(academic, null)
})

test('failed or non-terminal Production outcomes cannot become practical proof', () => {
  const envelope = {
    agentId: 'software-specialist', subjectId: 'computer_science' as const,
    baselineScore: 52, postStudyScore: 84,
    transferEvidenceRefs: ['exam://transfer/1'], delayedRetentionEvidenceRefs: ['exam://retention/1'],
    sourceEvidenceRefs: ['source://verified/1'], productionBaseline: 0.62, productionCandidate: 0.86,
    higherIsBetter: true, sampleSize: 30, independentScorer: true,
  }
  const academic = universityEvidenceFromVerifiedOutcome(envelope, {
    eligible: true, subject: 'incident diagnosis', experienceHash: 'a'.repeat(64),
    sourceClass: 'production_outcome', sourceRef: 'production://task/failed', domain: 'workflow',
    outcomeStatus: 'failure', success: false, score: 0, evidence: {},
  })
  assert.deepEqual(academic?.evidence.practicalEvidenceRefs, [])
})

test('verified outcome persistence invokes the University recorder only through explicit correlation', async () => {
  const fs = await import('node:fs')
  const source = fs.readFileSync(new URL('../lib/ai/cos/cognitiveVerifiedOutcome.ts', import.meta.url), 'utf8')
  assert.match(source, /universityEvidenceFromVerifiedOutcome\(input\.universityEvidence, decision\)/)
  assert.match(source, /recordCosUniversityRealWorldOutcome\(\{ \.\.\.universityInput, observedAt:/)
})
