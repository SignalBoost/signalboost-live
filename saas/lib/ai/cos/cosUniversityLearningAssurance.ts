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
  const foundationValid = blockers.length === 0
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
    : !eligibleForTraining ? foundationValid && input.datasetApprovedByHost ? 'dataset_approved' : 'proposed'
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
  /** Original host runner payload. Missing legacy payload is not execution proof. */
  executionEvidence?: unknown
}>

/**
 * Additional execution veto, not a grade or a complete capability certification. Scheduler health
 * is retained in the ledger but cannot stand in for a worker. Undergraduate exam paths additionally
 * require a fresh scored attempt; a genuine failed exam still proves execution, never mastery.
 */
export function universityProductionExecutionBlocker(path: LearningPathId, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'execution_evidence_missing'
  const evidence = value as Record<string, unknown>
  for (const flag of ['runnerInvoked', 'enabled', 'skipped']) {
    if (flag in evidence && typeof evidence[flag] !== 'boolean') return 'execution_evidence_malformed'
  }
  if (evidence.dailyCadence === 'not_due' || evidence.runnerInvoked === false || evidence.skipped === true) return 'runner_not_invoked'
  if (evidence.enabled === false) return 'runner_disabled'
  if (evidence.blocked != null && evidence.blocked !== false) return 'runner_blocked'
  if (['blocked', 'skipped', 'not_due', 'nothing_due', 'deferred', 'not_claimed'].includes(String(evidence.status))) return 'runner_did_no_work'
  if (evidence.error != null && evidence.error !== '') return 'runner_failed'
  if ('errors' in evidence && (!Array.isArray(evidence.errors) || evidence.errors.length !== 0)) return 'runner_failed'

  const academic = ['independent_exams', 'subject_a_range_evidence', 'language_a_range_evidence', 'delayed_retention'].includes(path)
  if (academic) {
    const attempted = evidence.attempted
    if (typeof attempted !== 'number' || !Number.isSafeInteger(attempted) || attempted < 1) return 'fresh_academic_execution_missing'
    const scored = (row: Record<string, unknown>) =>
      (row.status === 'passed' && row.passed === true) || (row.status === 'failed' && row.passed === false)
    if (path === 'delayed_retention') return attempted === 1 && scored(evidence) ? null : 'fresh_academic_execution_missing'
    if (!Array.isArray(evidence.runs)) return 'fresh_academic_execution_missing'
    const terminal = evidence.runs.filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === 'object' && !Array.isArray(row) && scored(row as Record<string, unknown>)))
    const ids = terminal.map(row => typeof row.runId === 'string' ? row.runId.trim() : '')
    return terminal.length === attempted && ids.every(Boolean) && new Set(ids).size === ids.length
      ? null : 'fresh_academic_execution_missing'
  }

  // Other lanes retain their existing invocation semantics. An explicit host invocation or an
  // enabled structured runner result is needed; receipt metadata alone cannot attest execution.
  // This does not prove training, graduate completion, practical success, retention or improvement.
  const metadata = new Set(['claim', 'featureFlag', 'featureEnabled', 'invocationSucceeded', 'runnerInvoked', 'enabled', 'skipped', 'errors', 'error', 'blocked', 'semantics', 'agentId'])
  const hasRunnerResult = evidence.enabled === true && Object.keys(evidence).some(key => !metadata.has(key))
  return evidence.runnerInvoked === true || hasRunnerResult ? null : 'execution_evidence_missing'
}

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
    && receipt.featureEnabled === true
    && receipt.invocationSucceeded === true
    && universityProductionExecutionBlocker(receipt.path, receipt.executionEvidence) === null
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
