import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import type { WorkingCosBalancedBundleLike } from './cosWorkingDistillation.ts'
import { buildWorkingCosDistillationPlanFromBundle } from './cosWorkingDistillation.ts'

export const COS_WORKING_DISTILLATION_CANDIDATE_PROFILE = 'cos-working-distillation-candidate-v1' as const

const HEX64 = /^[a-f0-9]{64}$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export type RegisterWorkingCosCandidateInput = Readonly<{
  enabled: boolean
  bundle: WorkingCosBalancedBundleLike & Readonly<{
    subjectCount?: number
    subjectIds?: readonly string[]
    assetSetKeys?: readonly string[]
  }>
  targetBaseModel: unknown
  configuredRuntimeModel: unknown
  baselineIdentity: unknown
  rollbackArtifactRef: unknown
}>

/**
 * Persist one immutable Working-COS candidate identity after the balanced bundle and exact runtime
 * contract pass. Registration is evidence only: it cannot partition data, spend money, dispatch
 * training, mutate a model, authorize traffic, or claim University graduation.
 */
export async function registerWorkingCosDistillationCandidate(
  input: RegisterWorkingCosCandidateInput,
  dbOverride?: any,
) {
  const plan = buildWorkingCosDistillationPlanFromBundle(input)
  if (!plan.eligible || !plan.candidateId || !plan.assetSetKey || !plan.portableManifestHash) {
    return Object.freeze({
      registered: false as const,
      eligible: false as const,
      blockers: plan.blockers,
      bundleBlockers: plan.bundleBlockers,
      candidateId: null,
      nextGate: 'blocked' as const,
    })
  }

  const db = dbOverride || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const subjectIds = [...new Set((input.bundle.subjectIds || []).map(value => clean(value, 240)).filter(Boolean))].sort()
  const assetSetKeys = [...new Set((input.bundle.assetSetKeys || [])
    .map(value => clean(value, 64).toLowerCase())
    .filter(value => HEX64.test(value)))].sort()

  const candidateKey = hash({
    profile: COS_WORKING_DISTILLATION_CANDIDATE_PROFILE,
    candidateId: plan.candidateId,
    bundleKey: plan.assetSetKey,
    portableManifestHash: plan.portableManifestHash,
    targetBaseModel: plan.targetBaseModel,
    baselineIdentity: plan.baselineIdentity,
    rollbackArtifactRef: plan.rollbackArtifactRef,
  })

  const row = {
    candidate_key: candidateKey,
    candidate_id: plan.candidateId,
    profile: COS_WORKING_DISTILLATION_CANDIDATE_PROFILE,
    bundle_key: plan.assetSetKey,
    portable_manifest_hash: plan.portableManifestHash,
    item_count: plan.itemCount,
    subject_count: Number(input.bundle.subjectCount || subjectIds.length || 0),
    subject_ids: subjectIds,
    asset_set_keys: assetSetKeys,
    target_base_model: plan.targetBaseModel,
    configured_runtime_model: plan.configuredRuntimeModel,
    baseline_identity: plan.baselineIdentity,
    rollback_artifact_ref: plan.rollbackArtifactRef,
    status: 'registered',
    next_gate: 'bounded_training_dispatch',
    automatic_training_authorized: false,
    automatic_activation_authorized: false,
    production_traffic_authorized: false,
    university_graduation_claimed: false,
    authority_expanded: false,
    evidence: {
      profile: COS_WORKING_DISTILLATION_CANDIDATE_PROFILE,
      bundleProfile: input.bundle['profile' as keyof typeof input.bundle] || null,
      exactRuntimeBound: true,
      modelNeutralEducation: true,
      immutableCandidate: true,
      inPlaceMutationAuthorized: false,
      automaticTrainingAuthorized: false,
      automaticActivationAuthorized: false,
      productionTrafficAuthorized: false,
      universityGraduationClaimed: false,
    },
  }

  const inserted = await db.from('cos_working_distillation_candidates')
    .upsert(row, { onConflict: 'candidate_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error

  return Object.freeze({
    registered: true as const,
    eligible: true as const,
    candidateKey,
    candidateId: plan.candidateId,
    bundleKey: plan.assetSetKey,
    portableManifestHash: plan.portableManifestHash,
    itemCount: plan.itemCount,
    subjectCount: row.subject_count,
    targetBaseModel: plan.targetBaseModel,
    baselineIdentity: plan.baselineIdentity,
    rollbackArtifactRef: plan.rollbackArtifactRef,
    status: 'registered' as const,
    nextGate: 'bounded_training_dispatch' as const,
    automaticTrainingAuthorized: false as const,
    automaticActivationAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    universityGraduationClaimed: false as const,
    authorityExpanded: false as const,
    semantics: 'immutable_working_cos_candidate_registration_no_dispatch_no_spend_no_traffic' as const,
  })
}
