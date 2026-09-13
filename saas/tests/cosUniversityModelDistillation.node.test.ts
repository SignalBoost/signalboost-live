import assert from 'node:assert/strict'
import test from 'node:test'
import { cosUniversityHybridLearningDesign } from '../lib/ai/cos/cosUniversityHybridLearning.ts'
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

test('private Production data and uncontrolled students cannot enter distillation training', () => {
  const privateData = decideModelDistillationCandidate(candidate({ containsPrivateProductionData: true }))
  assert.ok(privateData.blockers.includes('private_production_data_present'))
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
  const decision = decideModelDistillationPromotion({
    candidate: candidate(),
    trainedArtifactId: 'student-v2',
    independentEvaluatorId: 'teacher-model',
    teacherModelIdUsedAsEvaluator: true,
    baselineScore: 0.5,
    studentScore: 0.8,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
    safetyRegressionPassed: true,
    verifiedSourceAttribution: true,
    authorityExpanded: false,
  })
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('teacher_cannot_be_independent_evaluator'))
})

test('promotion requires independent improvement, transfer, retention, safety and provenance', () => {
  const decision = decideModelDistillationPromotion({
    candidate: candidate(),
    trainedArtifactId: 'student-v2',
    independentEvaluatorId: 'independent-host-evaluator-v1',
    baselineScore: 0.5,
    studentScore: 0.76,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
    safetyRegressionPassed: true,
    verifiedSourceAttribution: true,
    authorityExpanded: false,
  })
  assert.equal(decision.eligibleForPromotion, true)
  assert.deepEqual(decision.blockers, [])
})

test('distillation can never widen the student authority boundary', () => {
  const decision = decideModelDistillationPromotion({
    candidate: candidate(),
    trainedArtifactId: 'student-v2',
    independentEvaluatorId: 'independent-host-evaluator-v1',
    baselineScore: 0.5,
    studentScore: 0.76,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
    safetyRegressionPassed: true,
    verifiedSourceAttribution: true,
    authorityExpanded: true,
  })
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('authority_expansion_forbidden'))
})
