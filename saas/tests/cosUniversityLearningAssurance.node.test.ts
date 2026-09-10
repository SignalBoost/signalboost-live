import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
  decideControlledFineTune,
  evaluateRealWorldLearningEvidence,
  verifyLearningPathReceipts,
  type ProductionPathReceipt,
} from '../lib/ai/cos/cosUniversityLearningAssurance.ts'

const hash = (char: string) => char.repeat(64)
const ROOT = path.resolve(import.meta.dirname, '..')

test('controlled fine-tuning fails closed without separation, approvals, independent gains and rollback', () => {
  const decision = decideControlledFineTune({
    candidateId: 'candidate-1', baseModel: 'private-base', datasetHash: hash('a'),
    trainingManifestHash: hash('b'), holdoutManifestHash: hash('b'),
    datasetApprovedByHost: false, trainingApprovedByHost: false, independentEvaluation: false,
    baselineScore: 70, candidateScore: 70, passedSafetyRegression: false,
    passedUnseenTransfer: false, passedDelayedRetention: false, productionCanaryHealthy: false,
  })
  assert.equal(decision.eligibleForTraining, false)
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('training_holdout_not_separated'))
  assert.ok(decision.blockers.includes('rollback_artifact_missing'))
})

test('controlled fine-tuning promotes only a fully evidenced reversible candidate', () => {
  const decision = decideControlledFineTune({
    candidateId: 'candidate-1', baseModel: 'private-base', datasetHash: hash('a'),
    trainingManifestHash: hash('b'), holdoutManifestHash: hash('c'),
    datasetApprovedByHost: true, trainingApprovedByHost: true, independentEvaluation: true,
    baselineScore: 70, candidateScore: 82, passedSafetyRegression: true,
    passedUnseenTransfer: true, passedDelayedRetention: true, productionCanaryHealthy: true,
    rollbackArtifactRef: 'artifact://candidate-1/base',
  })
  assert.equal(decision.stage, 'promoted')
  assert.equal(decision.eligibleForPromotion, true)
  assert.deepEqual(decision.blockers, [])
})

test('production verification covers every declared gated learning path at the deployed commit', () => {
  const now = new Date('2026-09-10T12:00:00Z')
  const receipts = Object.keys(COS_UNIVERSITY_FEATURE_GATED_PATHS).map(path => ({
    path, deploymentId: 'dpl_1', commitSha: hash('d'), observedAt: '2026-09-10T11:00:00Z',
    expiresAt: '2026-09-11T11:00:00Z', featureEnabled: true, invocationSucceeded: true,
    durableEvidenceRef: `db://learning-path/${path}`, verifier: 'host_production_verifier',
  })) as ProductionPathReceipt[]
  assert.equal(verifyLearningPathReceipts({ expectedCommitSha: hash('d'), now, receipts }).verified, true)
  receipts[0] = { ...receipts[0], commitSha: hash('e') }
  const failed = verifyLearningPathReceipts({ expectedCommitSha: hash('d'), now, receipts })
  assert.equal(failed.verified, false)
  assert.deepEqual(failed.missingOrInvalid, ['continuous_learning'])
})

test('assurance registry covers every scheduled University route explicitly', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
  const scheduled = vercel.crons
    .map((entry: { path: string }) => entry.path)
    .filter((route: string) => route.includes('/cos-university-'))
  const pathByRoute: Record<string, string> = {
    '/api/cron/cos-university-learning': 'continuous_learning',
    '/api/cron/cos-university-practice': 'deliberate_practice',
    '/api/cron/cos-university-exam': 'independent_exams',
    '/api/cron/cos-university-a-range': 'subject_a_range_evidence',
    '/api/cron/cos-university-language-a-range': 'language_a_range_evidence',
    '/api/cron/cos-university-graduation': 'graduation',
    '/api/cron/cos-university-masters-learning': 'masters_learning',
    '/api/cron/cos-university-masters-admission': 'masters_admission',
    '/api/cron/cos-university-masters-exam': 'masters_exams',
    '/api/cron/cos-university-masters-progress': 'masters_progress',
    '/api/cron/cos-university-phd-admission': 'phd_admission',
    '/api/cron/cos-university-phd-methodology-exam': 'phd_methodology_exams',
    '/api/cron/cos-university-phd-research': 'phd_research',
    '/api/cron/cos-university-phd-progress': 'phd_progress',
  }
  assert.deepEqual(scheduled.filter((route: string) => !pathByRoute[route]), [])
  for (const route of scheduled) assert.ok(pathByRoute[route] in COS_UNIVERSITY_FEATURE_GATED_PATHS)
})

test('real-world promotion requires retention, transfer and an improved production outcome', () => {
  const common = {
    baselineScore: 45, postStudyScore: 85, transferEvidenceRefs: ['exam://transfer/1'],
    practicalEvidenceRefs: ['production://task/1'], delayedRetentionEvidenceRefs: ['exam://retention/1'],
    sourceEvidenceRefs: ['source://paper/1'], independentScorer: true,
  }
  const improved = evaluateRealWorldLearningEvidence({
    ...common, productionOutcome: { baseline: 0.62, candidate: 0.81, higherIsBetter: true, sampleSize: 40 },
  })
  assert.equal(improved.promotionEligible, true)
  assert.equal(improved.outcomeImproved, true)
  assert.match(improved.evidenceHash, /^[a-f0-9]{64}$/)

  const regressed = evaluateRealWorldLearningEvidence({
    ...common, productionOutcome: { baseline: 0.62, candidate: 0.50, higherIsBetter: true, sampleSize: 40 },
  })
  assert.equal(regressed.promotionEligible, false)
  assert.equal(regressed.outcomeImproved, false)
})

test('assurance evidence is service-only and append-only', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260910043000_cos_university_learning_assurance.sql'), 'utf8')
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all .* from anon, authenticated/i)
  assert.match(migration, /grant select, insert .* to service_role/i)
  assert.doesNotMatch(migration, /grant .*update|grant .*delete/i)
  assert.match(migration, /before update or delete/i)
  assert.match(migration, /append-only/i)
})
