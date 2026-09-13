export const COS_UNIVERSITY_MODEL_DISTILLATION_VERSION = 'cos-university-model-distillation-v1' as const

export type ModelDistillationTrainingRights =
  | 'owned'
  | 'open_license'
  | 'contractually_permitted'
  | 'unknown'
  | 'prohibited'

export type ModelDistillationCandidateInput = Readonly<{
  teacherModelId: string
  studentModelId: string
  datasetHash: string
  provenanceRefs: readonly string[]
  trainingRights: ModelDistillationTrainingRights
  studentControlledByBuyer: boolean
  containsPrivateProductionData: boolean
  repeatedFailures: number
  independentRetestFailures: number
}>

export type ModelDistillationCandidateDecision = Readonly<{
  candidate: boolean
  eligibleForTrainingDataset: boolean
  autoExecuteTraining: false
  blockers: readonly string[]
}>

export type ModelDistillationPromotionInput = Readonly<{
  candidate: ModelDistillationCandidateInput
  trainedArtifactId?: string | null
  independentEvaluatorId?: string | null
  teacherModelIdUsedAsEvaluator?: boolean
  baselineScore?: number | null
  studentScore?: number | null
  unseenTransferPassed: boolean
  delayedRetentionPassed: boolean
  safetyRegressionPassed: boolean
  verifiedSourceAttribution: boolean
  authorityExpanded: boolean
}>

export type ModelDistillationPromotionDecision = Readonly<{
  eligibleForPromotion: boolean
  blockers: readonly string[]
}>

const HASH = /^[a-f0-9]{64}$/i
const PERMITTED_RIGHTS = new Set<ModelDistillationTrainingRights>([
  'owned',
  'open_license',
  'contractually_permitted',
])

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function finiteCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

/**
 * Distillation is a governed training candidate, not an automatic learning shortcut. A teacher output
 * may enter a training dataset only when rights and provenance are explicit, the student remains under
 * buyer control, private Production material is excluded, and ordinary study has already failed on
 * repeated independently scored retests.
 */
export function decideModelDistillationCandidate(input: ModelDistillationCandidateInput): ModelDistillationCandidateDecision {
  const blockers: string[] = []
  const teacher = text(input.teacherModelId)
  const student = text(input.studentModelId)
  const refs = [...new Set((input.provenanceRefs ?? []).map(text).filter(Boolean))]
  const repeatedFailures = finiteCount(input.repeatedFailures)
  const independentRetestFailures = finiteCount(input.independentRetestFailures)

  if (!teacher) blockers.push('teacher_model_missing')
  if (!student) blockers.push('student_model_missing')
  if (teacher && student && teacher === student) blockers.push('teacher_student_not_separated')
  if (!HASH.test(text(input.datasetHash))) blockers.push('dataset_hash_invalid')
  if (!refs.length) blockers.push('teacher_output_provenance_missing')
  if (!PERMITTED_RIGHTS.has(input.trainingRights)) blockers.push('training_rights_not_proven')
  if (input.studentControlledByBuyer !== true) blockers.push('student_not_buyer_controlled')
  if (input.containsPrivateProductionData === true) blockers.push('private_production_data_present')
  if (repeatedFailures < 3) blockers.push('repeated_failure_threshold_not_met')
  if (independentRetestFailures < 2) blockers.push('independent_retest_threshold_not_met')

  const candidate = blockers.length === 0
  return Object.freeze({
    candidate,
    eligibleForTrainingDataset: candidate,
    autoExecuteTraining: false,
    blockers: Object.freeze(blockers),
  })
}

/**
 * A distilled artifact is promoted only by independent evidence. Teacher imitation alone is never
 * treated as mastery, academic credit, Production proof, or expanded authority.
 */
export function decideModelDistillationPromotion(input: ModelDistillationPromotionInput): ModelDistillationPromotionDecision {
  const blockers = [...decideModelDistillationCandidate(input.candidate).blockers]
  const artifact = text(input.trainedArtifactId)
  const evaluator = text(input.independentEvaluatorId)
  const baseline = Number(input.baselineScore)
  const score = Number(input.studentScore)

  if (!artifact) blockers.push('trained_artifact_missing')
  if (!evaluator) blockers.push('independent_evaluator_missing')
  if (input.teacherModelIdUsedAsEvaluator === true || (evaluator && evaluator === text(input.candidate.teacherModelId))) {
    blockers.push('teacher_cannot_be_independent_evaluator')
  }
  if (!Number.isFinite(baseline) || !Number.isFinite(score) || baseline < 0 || baseline > 1 || score < 0 || score > 1 || score <= baseline) {
    blockers.push('independent_improvement_not_proven')
  }
  if (input.unseenTransferPassed !== true) blockers.push('unseen_transfer_missing')
  if (input.delayedRetentionPassed !== true) blockers.push('delayed_retention_missing')
  if (input.safetyRegressionPassed !== true) blockers.push('safety_regression_missing')
  if (input.verifiedSourceAttribution !== true) blockers.push('source_attribution_missing')
  if (input.authorityExpanded === true) blockers.push('authority_expansion_forbidden')

  return Object.freeze({
    eligibleForPromotion: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
  })
}
