import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_GRADUATE_MODEL_REGISTRY_VERSION = 'cos-university-graduate-model-registry-v1' as const

export type GraduateModelRegistrationInput = Readonly<{
  candidateId: string
  subjectId: string
  studentModelId: string
  trainedArtifactId: string
  trainedArtifactHash: string
  rollbackArtifactRef: string | null
  eligibleForPromotion: boolean
  authorityExpanded: boolean
  promotedAt: Date
}>

export type GraduateModelRegistrationDecision = Readonly<{
  adoptionRequired: boolean
  eligibleForRegistry: boolean
  status: 'not_promoted' | 'blocked' | 'pending_runtime'
  promotionEvidenceHash: string | null
  blockers: readonly string[]
}>

const HEX64 = /^[a-f0-9]{64}$/i

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Academic/model promotion is not the terminal lifecycle state. Every promoted distilled model must
 * become a tracked iTMounts graduate even when serving infrastructure is not ready yet. Runtime
 * activation remains separate and evidence-gated; this decision only allows the durable
 * `pending_runtime` employment/adoption record to be created.
 */
export function decideGraduateModelRegistration(input: GraduateModelRegistrationInput): GraduateModelRegistrationDecision {
  if (input.eligibleForPromotion !== true) {
    return Object.freeze({
      adoptionRequired: false,
      eligibleForRegistry: false,
      status: 'not_promoted',
      promotionEvidenceHash: null,
      blockers: Object.freeze([]),
    })
  }

  const blockers: string[] = []
  const candidateId = clean(input.candidateId, 240)
  const subjectId = clean(input.subjectId, 160)
  const studentModelId = clean(input.studentModelId, 240)
  const trainedArtifactId = clean(input.trainedArtifactId, 500)
  const trainedArtifactHash = clean(input.trainedArtifactHash, 64).toLowerCase()
  const rollbackArtifactRef = clean(input.rollbackArtifactRef, 1000)

  if (!candidateId) blockers.push('graduate_candidate_id_missing')
  if (!subjectId) blockers.push('graduate_subject_id_missing')
  if (!studentModelId) blockers.push('graduate_student_model_id_missing')
  if (!trainedArtifactId) blockers.push('graduate_trained_artifact_id_missing')
  if (!HEX64.test(trainedArtifactHash)) blockers.push('graduate_trained_artifact_hash_invalid')
  if (!rollbackArtifactRef) blockers.push('graduate_rollback_artifact_ref_missing')
  if (input.authorityExpanded !== false) blockers.push('graduate_authority_expansion_forbidden')
  if (!(input.promotedAt instanceof Date) || Number.isNaN(input.promotedAt.getTime())) blockers.push('graduate_promoted_at_invalid')

  const eligibleForRegistry = blockers.length === 0
  // Deliberately excludes wall-clock registration time: the same promoted artifact must always
  // resolve to the same promotion identity across reconciliation runs.
  const promotionEvidenceHash = eligibleForRegistry
    ? hash({
        profile: COS_UNIVERSITY_GRADUATE_MODEL_REGISTRY_VERSION,
        candidateId,
        subjectId,
        studentModelId,
        trainedArtifactId,
        trainedArtifactHash,
        rollbackArtifactRef,
        authorityExpanded: false,
      })
    : null

  return Object.freeze({
    adoptionRequired: true,
    eligibleForRegistry,
    status: eligibleForRegistry ? 'pending_runtime' : 'blocked',
    promotionEvidenceHash,
    blockers: Object.freeze(blockers),
  })
}

export async function registerPromotedGraduateModel(input: GraduateModelRegistrationInput) {
  const decision = decideGraduateModelRegistration(input)
  if (!decision.eligibleForRegistry || !decision.promotionEvidenceHash) {
    return { ...decision, tracked: false as const }
  }

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const candidateId = clean(input.candidateId, 240)
  const subjectId = clean(input.subjectId, 160)
  const studentModelId = clean(input.studentModelId, 240)
  const trainedArtifactId = clean(input.trainedArtifactId, 500)
  const trainedArtifactHash = clean(input.trainedArtifactHash, 64).toLowerCase()
  const rollbackArtifactRef = clean(input.rollbackArtifactRef, 1000)

  const result = await db.from('cos_university_graduate_model_registry').upsert({
    candidate_id: candidateId,
    subject_id: subjectId,
    student_model_id: studentModelId,
    trained_artifact_id: trainedArtifactId,
    trained_artifact_hash: trainedArtifactHash,
    promotion_evidence_hash: decision.promotionEvidenceHash,
    platform_scope: {
      kind: 'subject_relevant_cos_capability',
      subjectId,
      owner: 'itmounts',
      orchestrator: 'cos',
    },
    status: 'pending_runtime',
    rollback_artifact_ref: rollbackArtifactRef,
    authority_expanded: false,
    promoted_at: input.promotedAt.toISOString(),
  }, { onConflict: 'candidate_id,trained_artifact_hash', ignoreDuplicates: true })
  if (result.error) throw result.error

  return {
    ...decision,
    tracked: true as const,
  }
}
