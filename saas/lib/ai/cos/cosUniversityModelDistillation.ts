import {
  decideControlledFineTune,
  type FineTuneEvidence,
} from './cosUniversityLearningAssurance.ts'

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
  controlledFineTuneEvidence: FineTuneEvidence
  independentEvaluatorId: string
  teacherModelIdUsedAsEvaluator: boolean
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
 * buyer control, private Production material is explicitly proven absent, and ordinary study has
 * already failed on repeated independently scored retests.
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
  else if (input.containsPrivateProductionData !== false) blockers.push('private_production_data_absence_not_proven')
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
 * Distillation does not create a parallel promotion authority. The existing controlled fine-tuning
 * gate remains authoritative for dataset/training approval, train/holdout separation, trained
 * artifact identity, independent improvement, safety, transfer, retention, Production canary, and
 * rollback proof. Teacher/evaluator separation, teacher-output provenance, and authority preservation
 * are additional distillation-specific gates.
 */
export function decideModelDistillationPromotion(input: ModelDistillationPromotionInput): ModelDistillationPromotionDecision {
  const blockers = [...decideModelDistillationCandidate(input.candidate).blockers]
  const evidence = input.controlledFineTuneEvidence
  const evaluator = text(input.independentEvaluatorId)

  if (text(evidence.datasetHash) !== text(input.candidate.datasetHash)) blockers.push('controlled_dataset_mismatch')
  if (text(evidence.baseModel) !== text(input.candidate.studentModelId)) blockers.push('controlled_student_model_mismatch')

  const controlled = decideControlledFineTune(evidence)
  if (!controlled.eligibleForPromotion) blockers.push(...controlled.blockers)

  if (!evaluator) blockers.push('independent_evaluator_missing')
  if (input.teacherModelIdUsedAsEvaluator !== false || (evaluator && evaluator === text(input.candidate.teacherModelId))) {
    blockers.push('teacher_cannot_be_independent_evaluator')
  }
  if (input.verifiedSourceAttribution !== true) blockers.push('source_attribution_missing')
  if (input.authorityExpanded !== false) blockers.push('authority_expansion_forbidden')

  return Object.freeze({
    eligibleForPromotion: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
  })
}
