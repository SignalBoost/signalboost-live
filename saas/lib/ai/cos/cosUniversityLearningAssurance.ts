import { createHash } from 'node:crypto'
import {
  evaluateCosUniversityLearning,
  type CosUniversityLearningMeasurement,
} from './cosUniversityHybridLearning.ts'

export const COS_UNIVERSITY_ASSURANCE_PROFILE = 'cos_university_learning_assurance_v1'

export type FineTuneStage =
  | 'proposed'
  | 'dataset_approved'
  | 'training_approved'
  | 'trained'
  | 'evaluated'
  | 'promoted'
  | 'rejected'
  | 'rolled_back'

export type FineTuneEvidence = Readonly<{
  trainedArtifactId: string
  baseModel: string
  datasetHash: string
  trainingManifestHash: string
  holdoutManifestHash: string
  datasetApprovedByHost: boolean
  trainingApprovedByHost: boolean
  independentEvaluation: boolean
  baselineScore: number
  trainedArtifactScore: number
  passedSafetyRegression: boolean
  passedUnseenTransfer: boolean
  passedDelayedRetention: boolean
  productionCanaryHealthy: boolean
  rollbackArtifactRef?: string | null
}>

export type FineTuneDecision = Readonly<{
  stage: FineTuneStage
  eligibleForTraining: boolean
  eligibleForPromotion: boolean
  blockers: readonly string[]
}>

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}

/** Host-owned fine-tuning controller. It evaluates evidence; it never invokes a trainer. */
export function decideControlledFineTune(input: FineTuneEvidence): FineTuneDecision {
  const blockers: string[] = []
  if (!input.baseModel.trim()) blockers.push('base_model_missing')
  if (!validHash(input.datasetHash)) blockers.push('dataset_hash_invalid')
  if (!validHash(input.trainingManifestHash)) blockers.push('training_manifest_hash_invalid')
  if (!validHash(input.holdoutManifestHash)) blockers.push('holdout_manifest_hash_invalid')
  if (input.trainingManifestHash === input.holdoutManifestHash) blockers.push('training_holdout_not_separated')
  if (!input.datasetApprovedByHost) blockers.push('dataset_not_approved')
  if (!input.trainingApprovedByHost) blockers.push('training_not_approved')

  const eligibleForTraining = blockers.length === 0
  if (!input.trainedArtifactId.trim()) blockers.push('trained_artifact_id_missing')
  if (!input.independentEvaluation) blockers.push('independent_evaluation_missing')
  if (!(input.trainedArtifactScore > input.baselineScore)) blockers.push('no_measured_improvement')
  if (!input.passedSafetyRegression) blockers.push('safety_regression_failed')
  if (!input.passedUnseenTransfer) blockers.push('unseen_transfer_failed')
  if (!input.passedDelayedRetention) blockers.push('delayed_retention_failed')
  if (!input.productionCanaryHealthy) blockers.push('production_canary_unhealthy')
  if (!input.rollbackArtifactRef?.trim()) blockers.push('rollback_artifact_missing')

  const eligibleForPromotion = eligibleForTraining && blockers.length === 0
  const stage: FineTuneStage = eligibleForPromotion ? 'promoted'
    : !eligibleForTraining ? 'proposed'
      : !input.trainedArtifactId.trim() ? 'training_approved'
        : !input.independentEvaluation ? 'trained'
          : 'evaluated'
  return {
    stage,
    eligibleForTraining,
    eligibleForPromotion,
    blockers,
  }
}

export type LearningPathId =
  | 'registered_agent_cycle'
  | 'continuous_learning'
  | 'deliberate_practice'
  | 'independent_exams'
  | 'subject_a_range_evidence'
  | 'language_a_range_evidence'
  | 'delayed_retention'
  | 'graduation'
  | 'masters_learning'
  | 'masters_admission'
  | 'masters_exams'
  | 'masters_progress'
  | 'phd_runtime'
  | 'phd_admission'
  | 'phd_progress'
  | 'phd_research'
  | 'phd_methodology_exams'
  | 'controlled_fine_tuning'

export const COS_UNIVERSITY_FEATURE_GATED_PATHS: Readonly<Record<LearningPathId, string>> = Object.freeze({
  registered_agent_cycle: 'COS_UNIVERSITY_AUTONOMOUS_AGENT_CYCLE_ENABLED',
  continuous_learning: 'COS_UNIVERSITY_CONTINUOUS_ENABLED',
  deliberate_practice: 'COS_UNIVERSITY_PRACTICE_ENABLED',
  independent_exams: 'COS_UNIVERSITY_EXAMS_ENABLED',
  subject_a_range_evidence: 'COS_UNIVERSITY_A_RANGE_ENABLED',
  language_a_range_evidence: 'COS_UNIVERSITY_A_RANGE_ENABLED',
  delayed_retention: 'COS_UNIVERSITY_RETENTION_ENABLED',
  graduation: 'COS_UNIVERSITY_GRADUATION_ENABLED',
  masters_learning: 'COS_UNIVERSITY_MASTERS_LEARNING_ENABLED',
  masters_admission: 'COS_UNIVERSITY_ADMISSION_ENABLED',
  masters_exams: 'COS_UNIVERSITY_MASTERS_EXAMS_ENABLED',
  masters_progress: 'COS_UNIVERSITY_MASTERS_EXAMS_ENABLED',
  phd_runtime: 'COS_UNIVERSITY_PHD_RUNTIME_ENABLED',
  phd_admission: 'COS_UNIVERSITY_PHD_RUNTIME_ENABLED',
  phd_progress: 'COS_UNIVERSITY_PHD_RUNTIME_ENABLED',
  phd_research: 'COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED',
  phd_methodology_exams: 'COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED',
  controlled_fine_tuning: 'COS_UNIVERSITY_FINE_TUNING_ENABLED',
})

export type ProductionPathReceipt = Readonly<{
  path: LearningPathId
  deploymentId: string
  commitSha: string
  observedAt: string
  expiresAt: string
  featureEnabled: boolean
  invocationSucceeded: boolean
  durableEvidenceRef: string
  verifier: 'host_production_verifier'
}>

export function verifyLearningPathReceipts(input: {
  expectedCommitSha: string
  now: Date
  receipts: readonly ProductionPathReceipt[]
  requiredPaths?: readonly LearningPathId[]
}): { verified: boolean; missingOrInvalid: LearningPathId[] } {
  const required = input.requiredPaths || Object.keys(COS_UNIVERSITY_FEATURE_GATED_PATHS) as LearningPathId[]
  const valid = new Set(input.receipts.filter(receipt =>
    receipt.commitSha === input.expectedCommitSha
    && Boolean(receipt.deploymentId.trim())
    && receipt.featureEnabled
    && receipt.invocationSucceeded
    && Boolean(receipt.durableEvidenceRef.trim())
    && receipt.verifier === 'host_production_verifier'
    && Number.isFinite(Date.parse(receipt.observedAt))
    && Date.parse(receipt.observedAt) <= input.now.getTime()
    && Date.parse(receipt.expiresAt) > input.now.getTime()
  ).map(receipt => receipt.path))
  const missingOrInvalid = required.filter(path => !valid.has(path))
  return { verified: missingOrInvalid.length === 0, missingOrInvalid }
}

export type RealWorldLearningEvidence = Readonly<{
  baselineScore: number
  postStudyScore: number
  transferEvidenceRefs: readonly string[]
  practicalEvidenceRefs: readonly string[]
  delayedRetentionEvidenceRefs: readonly string[]
  sourceEvidenceRefs: readonly string[]
  productionOutcome: { baseline: number; candidate: number; higherIsBetter: boolean; sampleSize: number }
  independentScorer: boolean
}>

export function evaluateRealWorldLearningEvidence(input: RealWorldLearningEvidence) {
  const outcomeImproved = input.productionOutcome.sampleSize > 0 && (input.productionOutcome.higherIsBetter
    ? input.productionOutcome.candidate > input.productionOutcome.baseline
    : input.productionOutcome.candidate < input.productionOutcome.baseline)
  const result = evaluateCosUniversityLearning({
    baselineScore: input.baselineScore,
    postStudyScore: input.postStudyScore,
    passedUnseenTransfer: input.transferEvidenceRefs.length > 0,
    passedPracticalExecution: input.practicalEvidenceRefs.length > 0 && outcomeImproved,
    passedDelayedRetention: input.delayedRetentionEvidenceRefs.length > 0,
    verifiedSourceAttribution: input.sourceEvidenceRefs.length > 0,
    independentScorer: input.independentScorer,
  })
  const missing = [...result.missing]
  if (!outcomeImproved && !missing.includes('practical_execution')) missing.push('practical_execution')
  return {
    ...result,
    promotionEligible: result.promotionEligible && outcomeImproved,
    missing: missing as CosUniversityLearningMeasurement[],
    outcomeImproved,
    evidenceHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  }
}
