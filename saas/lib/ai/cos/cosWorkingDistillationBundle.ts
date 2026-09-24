import { createHash } from 'node:crypto'

export const COS_WORKING_DISTILLATION_BUNDLE_PROFILE = 'cos-working-distillation-balanced-bundle-v1' as const
export const COS_WORKING_DISTILLATION_MIN_SUBJECTS = 8 as const
export const COS_WORKING_DISTILLATION_MAX_SUBJECTS = 16 as const
export const COS_WORKING_DISTILLATION_MAX_ITEMS = 384 as const
export const COS_WORKING_DISTILLATION_MIN_SET_ITEMS = 20 as const

const HEX64 = /^[a-f0-9]{64}$/i
const TRAINING_RIGHTS = new Set([
  'owned',
  'open_license',
  'contractually_permitted',
  'governed_hosted_teacher_output',
])

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validTime(value: unknown): number {
  const parsed = Date.parse(clean(value, 100))
  return Number.isFinite(parsed) ? parsed : 0
}

export type WorkingCosVaultAssetSet = Readonly<{
  assetSetKey: unknown
  portableManifestHash: unknown
  subjectId: unknown
  itemCount: unknown
  trainingRights: unknown
  modelNeutral: unknown
  containsPrivateProductionData: unknown
  createdAt?: unknown
}>

export type WorkingCosBalancedBundleOptions = Readonly<{
  minSubjects?: number
  maxSubjects?: number
  maxItems?: number
  rotationSeed?: unknown
}>

export type WorkingCosBalancedBundleBlocker =
  | 'insufficient_subject_coverage'
  | 'insufficient_training_items'

export function workingCosTrainingRightsEligible(value: unknown): boolean {
  return TRAINING_RIGHTS.has(clean(value, 120).toLowerCase())
}

function normalizedRows(rows: readonly WorkingCosVaultAssetSet[]) {
  return rows.flatMap(row => {
    const assetSetKey = clean(row.assetSetKey, 64).toLowerCase()
    const portableManifestHash = clean(row.portableManifestHash, 64).toLowerCase()
    const subjectId = clean(row.subjectId, 240)
    const itemCount = Number(row.itemCount)
    const trainingRights = clean(row.trainingRights, 120).toLowerCase()
    if (!HEX64.test(assetSetKey)
      || !HEX64.test(portableManifestHash)
      || !subjectId
      || !Number.isInteger(itemCount)
      || itemCount < COS_WORKING_DISTILLATION_MIN_SET_ITEMS
      || row.modelNeutral !== true
      || row.containsPrivateProductionData === true
      || !workingCosTrainingRightsEligible(trainingRights)) return []
    return [{
      assetSetKey,
      portableManifestHash,
      subjectId,
      itemCount,
      trainingRights,
      createdAt: clean(row.createdAt, 100) || null,
      createdAtMs: validTime(row.createdAt),
    }]
  })
}

function rotate<T>(values: readonly T[], seed: string): T[] {
  if (!values.length) return []
  const offset = parseInt(hash(seed).slice(0, 8), 16) % values.length
  return [...values.slice(offset), ...values.slice(0, offset)]
}

/**
 * Build one cross-subject Working-COS training bundle from already sealed portable University assets.
 *
 * One newest set per subject is selected first. This deliberately prevents a subject with the largest
 * backlog from consuming the whole bundle. If more than maxSubjects are available, rotationSeed makes
 * subject coverage deterministic but rotatable across later Working-COS cycles.
 */
export function buildWorkingCosBalancedBundle(
  rows: readonly WorkingCosVaultAssetSet[],
  options: WorkingCosBalancedBundleOptions = {},
) {
  const minSubjects = Math.max(2, Math.min(32, Math.floor(options.minSubjects ?? COS_WORKING_DISTILLATION_MIN_SUBJECTS)))
  const maxSubjects = Math.max(minSubjects, Math.min(32, Math.floor(options.maxSubjects ?? COS_WORKING_DISTILLATION_MAX_SUBJECTS)))
  const maxItems = Math.max(
    minSubjects * COS_WORKING_DISTILLATION_MIN_SET_ITEMS,
    Math.min(5000, Math.floor(options.maxItems ?? COS_WORKING_DISTILLATION_MAX_ITEMS)),
  )
  const rotationSeed = clean(options.rotationSeed, 500) || COS_WORKING_DISTILLATION_BUNDLE_PROFILE

  const bySubject = new Map<string, ReturnType<typeof normalizedRows>>()
  for (const row of normalizedRows(rows)) {
    const current = bySubject.get(row.subjectId) || []
    current.push(row)
    bySubject.set(row.subjectId, current)
  }

  for (const subjectRows of bySubject.values()) {
    subjectRows.sort((a, b) =>
      b.createdAtMs - a.createdAtMs
      || b.itemCount - a.itemCount
      || a.assetSetKey.localeCompare(b.assetSetKey))
  }

  const subjects = rotate([...bySubject.keys()].sort(), rotationSeed).slice(0, maxSubjects)
  const selected = []
  let totalItems = 0
  for (const subject of subjects) {
    const row = bySubject.get(subject)?.[0]
    if (!row) continue
    if (totalItems + row.itemCount > maxItems) continue
    selected.push(row)
    totalItems += row.itemCount
  }

  const blockers: WorkingCosBalancedBundleBlocker[] = []
  if (selected.length < minSubjects) blockers.push('insufficient_subject_coverage')
  if (totalItems < minSubjects * COS_WORKING_DISTILLATION_MIN_SET_ITEMS) blockers.push('insufficient_training_items')

  const eligible = blockers.length === 0
  const assetSetKeys = selected.map(row => row.assetSetKey).sort()
  const portableManifestHashes = selected.map(row => row.portableManifestHash).sort()
  const subjectIds = selected.map(row => row.subjectId).sort()
  const combinedPortableManifestHash = eligible
    ? hash({ profile: COS_WORKING_DISTILLATION_BUNDLE_PROFILE, portableManifestHashes })
    : null
  const bundleKey = eligible
    ? hash({
        profile: COS_WORKING_DISTILLATION_BUNDLE_PROFILE,
        assetSetKeys,
        combinedPortableManifestHash,
        subjectIds,
        totalItems,
      })
    : null

  return Object.freeze({
    profile: COS_WORKING_DISTILLATION_BUNDLE_PROFILE,
    eligible,
    blockers: Object.freeze(blockers),
    bundleKey,
    combinedPortableManifestHash,
    itemCount: totalItems,
    subjectCount: selected.length,
    subjectIds: Object.freeze(subjectIds),
    assetSetKeys: Object.freeze(assetSetKeys),
    assetSets: Object.freeze(selected.map(row => Object.freeze({
      assetSetKey: row.assetSetKey,
      portableManifestHash: row.portableManifestHash,
      subjectId: row.subjectId,
      itemCount: row.itemCount,
      trainingRights: row.trainingRights,
      createdAt: row.createdAt,
    }))),
    modelNeutral: true as const,
    containsPrivateProductionData: false as const,
    trainingRightsEligible: eligible,
    sourceSelection: 'newest_sealed_set_per_subject_balanced_before_volume' as const,
    automaticTrainingAuthorized: false as const,
    automaticActivationAuthorized: false as const,
  })
}
