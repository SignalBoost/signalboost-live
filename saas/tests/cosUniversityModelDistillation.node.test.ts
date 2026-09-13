import assert from 'node:assert/strict'
import test from 'node:test'
import { cosUniversityHybridLearningDesign } from '../lib/ai/cos/cosUniversityHybridLearning.ts'
import type { FineTuneEvidence } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'
import {
  decideModelDistillationCandidate,
  decideModelDistillationPromotion,
  type ModelDistillationCandidateInput,
} from '../lib/ai/cos/cosUniversityModelDistillation.ts'

const H = 'a'.repeat(64)
const candidate = (patch: Partial<ModelDistillationCandidateInput> = {}): ModelDistillationCandidateInput => ({
  teacherModelId: 'teacher-model',
  studentModelId: 'buyer-local-student',
  datasetHash: H,
  provenanceRefs: ['teacher-output-batch:sha256:abc'],
  trainingRights: 'contractually_permitted',
  studentControlledByBuyer: true,
  containsPrivateProductionData: false,
  repeatedFailures: 3,
  independentRetestFailures: 2,
  ...patch,
})

const controlled = (patch: Partial<FineTuneEvidence> = {}): FineTuneEvidence => ({
  trainedArtifactId: 'student-v2',
  baseModel: 'buyer-local-student',
  datasetHash: H,
  trainingManifestHash: 'b'.repeat(64),
  holdoutManifestHash: 'c'.repeat(64),
  datasetApprovedByHost: true,
  trainingApprovedByHost: true,
  independentEvaluation: true,
  baselineScore: 0.5,
  trainedArtifactScore: 0.76,
  passedSafetyRegression: true,
  passedUnseenTransfer: true,
  passedDelayedRetention: true,
  productionCanaryHealthy: true,
  rollbackArtifactRef: 'rollback:student-v2',
  ...patch,
})

const promotion = (patch: Partial<Parameters<typeof decideModelDistillationPromotion>[0]> = {}) => ({
  candidate: candidate(),
  controlledFineTuneEvidence: controlled(),
  independentEvaluatorId: 'independent-host-evaluator-v1',
  teacherModelIdUsedAsEvaluator: false,
  verifiedSourceAttribution: true,
  authorityExpanded: false,
  ...patch,
})

test('model distillation is candidate-only even after repeated independent failure', () => {
  const decision = decideModelDistillationCandidate(candidate())
  assert.equal(decision.candidate, true)
  assert.equal(decision.eligibleForTrainingDataset, true)
  assert.equal(decision.autoExecuteTraining, false)
  assert.deepEqual(decision.blockers, [])
})

test('University represents model distillation separately from generic fine tuning', () => {
  const design = cosUniversityHybridLearningDesign({
    failureClass: 'reasoning',
    sourceKinds: [],
    fineTuneCandidate: true,
    modelDistillationCandidate: true,
  })
  assert.ok(design.paradigms.includes('fine_tune_candidate'))
  assert.ok(design.paradigms.includes('model_distillation_candidate'))
})

test('unknown or prohibited teacher-output rights fail closed', () => {
  for (const trainingRights of ['unknown', 'prohibited'] as const) {
    const decision = decideModelDistillationCandidate(candidate({ trainingRights }))
    assert.equal(decision.candidate, false)
    assert.ok(decision.blockers.includes('training_rights_not_proven'))
  }
})

test('private Production data must be explicitly proven absent', () => {
  const privateData = decideModelDistillationCandidate(candidate({ containsPrivateProductionData: true }))
  assert.ok(privateData.blockers.includes('private_production_data_present'))

  const unknownPrivacy = decideModelDistillationCandidate({
    ...candidate(),
    containsPrivateProductionData: undefined,
  } as unknown as ModelDistillationCandidateInput)
  assert.equal(unknownPrivacy.candidate, false)
  assert.ok(unknownPrivacy.blockers.includes('private_production_data_absence_not_proven'))
})

test('uncontrolled students cannot enter distillation training', () => {
  const externalStudent = decideModelDistillationCandidate(candidate({ studentControlledByBuyer: false }))
  assert.ok(externalStudent.blockers.includes('student_not_buyer_controlled'))
})

test('teacher outputs require durable provenance and a valid dataset identity', () => {
  const decision = decideModelDistillationCandidate(candidate({ provenanceRefs: [], datasetHash: 'not-a-hash' }))
  assert.equal(decision.candidate, false)
  assert.ok(decision.blockers.includes('teacher_output_provenance_missing'))
  assert.ok(decision.blockers.includes('dataset_hash_invalid'))
})

test('ordinary study must fail repeatedly before distillation is considered', () => {
  const early = decideModelDistillationCandidate(candidate({ repeatedFailures: 2, independentRetestFailures: 1 }))
  assert.equal(early.candidate, false)
  assert.ok(early.blockers.includes('repeated_failure_threshold_not_met'))
  assert.ok(early.blockers.includes('independent_retest_threshold_not_met'))
})

test('teacher imitation alone can never promote the student', () => {
  const decision = decideModelDistillationPromotion(promotion({
    independentEvaluatorId: 'teacher-model',
    teacherModelIdUsedAsEvaluator: true,
  }))
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('teacher_cannot_be_independent_evaluator'))
})

test('distillation promotion must pass the existing controlled fine-tuning gate', () => {
  const decision = decideModelDistillationPromotion(promotion({
    controlledFineTuneEvidence: controlled({
      productionCanaryHealthy: false,
      rollbackArtifactRef: null,
    }),
  }))
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('production_canary_unhealthy'))
  assert.ok(decision.blockers.includes('rollback_artifact_missing'))
})

test('controlled evidence must bind the exact distillation dataset and student', () => {
  const wrongDataset = decideModelDistillationPromotion(promotion({
    controlledFineTuneEvidence: controlled({ datasetHash: 'd'.repeat(64) }),
  }))
  assert.ok(wrongDataset.blockers.includes('controlled_dataset_mismatch'))

  const wrongStudent = decideModelDistillationPromotion(promotion({
    controlledFineTuneEvidence: controlled({ baseModel: 'another-student' }),
  }))
  assert.ok(wrongStudent.blockers.includes('controlled_student_model_mismatch'))
})

test('promotion requires controlled approval, improvement, transfer, retention, safety, canary and rollback proof', () => {
  const decision = decideModelDistillationPromotion(promotion())
  assert.equal(decision.eligibleForPromotion, true)
  assert.deepEqual(decision.blockers, [])
})

test('distillation can never widen the student authority boundary', () => {
  const decision = decideModelDistillationPromotion(promotion({ authorityExpanded: true }))
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('authority_expansion_forbidden'))
})
