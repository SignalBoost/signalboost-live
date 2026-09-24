import { createHash } from 'node:crypto'

export const COS_WORKING_DISTILLATION_PROFILE = 'cos-working-distillation-v1' as const
export const COS_WORKING_DISTILLATION_MIN_ITEMS = 20 as const

const HEX64 = /^[a-f0-9]{64}$/i

function text(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export type WorkingCosDistillationInput = Readonly<{
  enabled: boolean
  assetSetKey: unknown
  portableManifestHash: unknown
  itemCount: unknown
  assetSetSealed: boolean
  modelNeutral: boolean
  containsPrivateProductionData: boolean
  trainingRightsEligible: boolean
  targetBaseModel: unknown
  configuredRuntimeModel: unknown
  baselineIdentity: unknown
  rollbackArtifactRef: unknown
}>

export type WorkingCosDistillationBlocker =
  | 'working_cos_distillation_disabled'
  | 'asset_set_unsealed'
  | 'asset_set_identity_invalid'
  | 'portable_manifest_invalid'
  | 'insufficient_training_items'
  | 'asset_not_model_neutral'
  | 'private_production_data_forbidden'
  | 'training_rights_not_eligible'
  | 'target_base_model_missing'
  | 'configured_runtime_model_missing'
  | 'target_base_model_not_current_runtime'
  | 'baseline_identity_missing'
  | 'rollback_target_missing'

/**
 * Builds the fail-closed contract for the fast Working-COS lane.
 *
 * This function intentionally does not dispatch training or authorize traffic. It proves that a
 * future dispatcher has a sealed portable asset set, an exact current COS model binding, and an
 * explicit rollback target before any cost-bearing or runtime-changing work is considered.
 */
export function buildWorkingCosDistillationPlan(input: WorkingCosDistillationInput) {
  const blockers: WorkingCosDistillationBlocker[] = []
  const assetSetKey = text(input.assetSetKey, 64).toLowerCase()
  const portableManifestHash = text(input.portableManifestHash, 64).toLowerCase()
  const targetBaseModel = text(input.targetBaseModel, 240)
  const configuredRuntimeModel = text(input.configuredRuntimeModel, 240)
  const baselineIdentity = text(input.baselineIdentity, 500)
  const rollbackArtifactRef = text(input.rollbackArtifactRef, 2000)
  const itemCount = Number(input.itemCount)

  if (input.enabled !== true) blockers.push('working_cos_distillation_disabled')
  if (input.assetSetSealed !== true) blockers.push('asset_set_unsealed')
  if (!HEX64.test(assetSetKey)) blockers.push('asset_set_identity_invalid')
  if (!HEX64.test(portableManifestHash)) blockers.push('portable_manifest_invalid')
  if (!Number.isInteger(itemCount) || itemCount < COS_WORKING_DISTILLATION_MIN_ITEMS) {
    blockers.push('insufficient_training_items')
  }
  if (input.modelNeutral !== true) blockers.push('asset_not_model_neutral')
  if (input.containsPrivateProductionData === true) blockers.push('private_production_data_forbidden')
  if (input.trainingRightsEligible !== true) blockers.push('training_rights_not_eligible')
  if (!targetBaseModel) blockers.push('target_base_model_missing')
  if (!configuredRuntimeModel) blockers.push('configured_runtime_model_missing')
  if (targetBaseModel && configuredRuntimeModel && targetBaseModel !== configuredRuntimeModel) {
    blockers.push('target_base_model_not_current_runtime')
  }
  if (!baselineIdentity) blockers.push('baseline_identity_missing')
  if (!rollbackArtifactRef) blockers.push('rollback_target_missing')

  const eligible = blockers.length === 0
  const candidateId = eligible
    ? `working-cos:${hash([
        COS_WORKING_DISTILLATION_PROFILE,
        assetSetKey,
        portableManifestHash,
        targetBaseModel,
        baselineIdentity,
      ]).slice(0, 32)}`
    : null

  return Object.freeze({
    profile: COS_WORKING_DISTILLATION_PROFILE,
    eligible,
    blockers: Object.freeze(blockers),
    candidateId,
    assetSetKey: HEX64.test(assetSetKey) ? assetSetKey : null,
    portableManifestHash: HEX64.test(portableManifestHash) ? portableManifestHash : null,
    itemCount: Number.isInteger(itemCount) ? itemCount : 0,
    targetBaseModel: targetBaseModel || null,
    configuredRuntimeModel: configuredRuntimeModel || null,
    baselineIdentity: baselineIdentity || null,
    rollbackArtifactRef: rollbackArtifactRef || null,
    artifactStrategy: 'new_immutable_candidate' as const,
    inPlaceMutationAuthorized: false as const,
    automaticActivationAuthorized: false as const,
    universityGraduationClaimed: false as const,
    productionTrafficAuthorized: false as const,
    nextGate: eligible ? 'bounded_training_dispatch' as const : 'blocked' as const,
  })
}


export type WorkingCosBalancedBundleLike = Readonly<{
  eligible: boolean
  bundleKey: string | null
  combinedPortableManifestHash: string | null
  itemCount: number
  modelNeutral: boolean
  containsPrivateProductionData: boolean
  trainingRightsEligible: boolean
  blockers?: readonly string[]
}>

/**
 * Bind one already-balanced, model-neutral education bundle to an exact Working-COS runtime identity.
 * Bundle construction and runtime authorization stay separate so education can keep accumulating while
 * a served-model/rollback proof is unavailable. This function still grants no training or traffic.
 */
export function buildWorkingCosDistillationPlanFromBundle(input: Readonly<{
  enabled: boolean
  bundle: WorkingCosBalancedBundleLike
  targetBaseModel: unknown
  configuredRuntimeModel: unknown
  baselineIdentity: unknown
  rollbackArtifactRef: unknown
}>) {
  const plan = buildWorkingCosDistillationPlan({
    enabled: input.enabled && input.bundle.eligible === true,
    assetSetKey: input.bundle.bundleKey,
    portableManifestHash: input.bundle.combinedPortableManifestHash,
    itemCount: input.bundle.itemCount,
    assetSetSealed: input.bundle.eligible === true,
    modelNeutral: input.bundle.modelNeutral === true,
    containsPrivateProductionData: input.bundle.containsPrivateProductionData === true,
    trainingRightsEligible: input.bundle.trainingRightsEligible === true,
    targetBaseModel: input.targetBaseModel,
    configuredRuntimeModel: input.configuredRuntimeModel,
    baselineIdentity: input.baselineIdentity,
    rollbackArtifactRef: input.rollbackArtifactRef,
  })
  return Object.freeze({
    ...plan,
    bundleEligible: input.bundle.eligible === true,
    bundleBlockers: Object.freeze([...(input.bundle.blockers || [])]),
    semantics: 'balanced_portable_education_bound_to_exact_working_cos_runtime_no_dispatch_no_traffic' as const,
  })
}
