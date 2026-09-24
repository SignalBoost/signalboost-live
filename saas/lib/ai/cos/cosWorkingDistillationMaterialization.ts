import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import {
  selectWorkingCosBalancedBundleFromVault,
  type WorkingCosBalancedBundleOptions,
} from './cosWorkingDistillationBundle.ts'
import type { WorkingCosRuntimeIdentity } from './cosWorkingRuntimeBinding.ts'
import { workingCosRuntimeBindingFromEnv } from './cosWorkingRuntimeBinding.ts'

export const COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE =
  'cos-working-distillation-materialization-v1' as const

const HEX64 = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i

function clean(value: unknown, max = 250_000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function manifestHash(items: readonly string[]): string {
  return hash({ items: [...items].sort() })
}

export type WorkingCosMaterializationRow = Readonly<{
  assetSetKey: string
  subjectId: string
  promptId: string
  prompt: string
  response: string
  text: string
  itemHash: string
  portableContentHash: string
  trainingRights: string
}>

export type WorkingCosMaterializationInput = Readonly<{
  bundle: Readonly<{
    eligible: boolean
    bundleKey: string | null
    combinedPortableManifestHash: string | null
    itemCount: number
    subjectCount: number
    subjectIds: readonly string[]
    assetSets: readonly Readonly<{
      assetSetKey: string
      portableManifestHash: string
      subjectId: string
      itemCount: number
      trainingRights: string
    }>[]
  }>
  runtimeBinding: Readonly<{
    eligible: boolean
    bindingKey: string | null
    observedRuntimeDigest: string | null
    trainableBaseModelId: string | null
    trainableBaseModelRevision: string | null
    baselineIdentity: string | null
    rollbackArtifactRef: string | null
  }>
  rows: readonly WorkingCosMaterializationRow[]
}>

function normalizedRows(rows: readonly WorkingCosMaterializationRow[]) {
  return rows.map(row => Object.freeze({
    assetSetKey: clean(row.assetSetKey, 64).toLowerCase(),
    subjectId: clean(row.subjectId, 240),
    promptId: clean(row.promptId, 160),
    prompt: clean(row.prompt, 100_000),
    response: clean(row.response, 100_000),
    text: clean(row.text, 250_000),
    itemHash: clean(row.itemHash, 64).toLowerCase(),
    portableContentHash: clean(row.portableContentHash, 64).toLowerCase(),
    trainingRights: clean(row.trainingRights, 120).toLowerCase(),
  }))
}

export function buildWorkingCosMaterialization(input: WorkingCosMaterializationInput) {
  const blockers: string[] = []
  const bundleKey = clean(input.bundle.bundleKey, 64).toLowerCase()
  const runtimeBindingKey = clean(input.runtimeBinding.bindingKey, 64).toLowerCase()
  const runtimeDigest = clean(input.runtimeBinding.observedRuntimeDigest, 64).toLowerCase()
  const baseModel = clean(input.runtimeBinding.trainableBaseModelId, 300)
  const baseRevision = clean(input.runtimeBinding.trainableBaseModelRevision, 40).toLowerCase()

  if (input.bundle.eligible !== true) blockers.push('working_cos_bundle_not_eligible')
  if (!HEX64.test(bundleKey)) blockers.push('working_cos_bundle_key_invalid')
  if (input.runtimeBinding.eligible !== true) blockers.push('working_cos_runtime_binding_not_eligible')
  if (!HEX64.test(runtimeBindingKey)) blockers.push('working_cos_runtime_binding_key_invalid')
  if (!HEX64.test(runtimeDigest)) blockers.push('working_cos_runtime_digest_invalid')
  if (!baseModel) blockers.push('working_cos_base_model_missing')
  if (!HEX40.test(baseRevision)) blockers.push('working_cos_base_revision_invalid')

  const expectedSets = new Map(input.bundle.assetSets.map(set => [clean(set.assetSetKey, 64).toLowerCase(), {
    assetSetKey: clean(set.assetSetKey, 64).toLowerCase(),
    portableManifestHash: clean(set.portableManifestHash, 64).toLowerCase(),
    subjectId: clean(set.subjectId, 240),
    itemCount: Number(set.itemCount),
    trainingRights: clean(set.trainingRights, 120).toLowerCase(),
  }]))
  if (expectedSets.size !== input.bundle.assetSets.length) blockers.push('working_cos_bundle_set_identity_duplicate')

  const rows = normalizedRows(input.rows)
  const seenItemHashes = new Set<string>()
  const seenPortableHashes = new Set<string>()
  const bySet = new Map<string, typeof rows>()
  for (const row of rows) {
    const expected = expectedSets.get(row.assetSetKey)
    if (!expected) { blockers.push('working_cos_asset_outside_bundle'); continue }
    if (!row.subjectId || row.subjectId !== expected.subjectId) blockers.push('working_cos_asset_subject_mismatch')
    if (!row.promptId || !row.prompt || !row.response || !row.text) blockers.push('working_cos_asset_supervised_pair_missing')
    if (!HEX64.test(row.itemHash) || sha256(row.text) !== row.itemHash) blockers.push('working_cos_asset_item_hash_mismatch')
    if (!HEX64.test(row.portableContentHash)
      || hash({ prompt: row.prompt, response: row.response }) !== row.portableContentHash) {
      blockers.push('working_cos_asset_portable_hash_mismatch')
    }
    if (row.trainingRights !== expected.trainingRights) blockers.push('working_cos_asset_rights_mismatch')
    if (seenItemHashes.has(row.itemHash)) blockers.push('working_cos_asset_item_duplicate')
    if (seenPortableHashes.has(row.portableContentHash)) blockers.push('working_cos_asset_portable_duplicate')
    seenItemHashes.add(row.itemHash)
    seenPortableHashes.add(row.portableContentHash)
    const current = bySet.get(row.assetSetKey) || []
    current.push(row)
    bySet.set(row.assetSetKey, current)
  }

  for (const expected of expectedSets.values()) {
    const setRows = bySet.get(expected.assetSetKey) || []
    if (setRows.length !== expected.itemCount) blockers.push('working_cos_asset_set_incomplete')
    const portableHashes = setRows.map(row => row.portableContentHash)
    if (!HEX64.test(expected.portableManifestHash)
      || manifestHash(portableHashes) !== expected.portableManifestHash) {
      blockers.push('working_cos_asset_set_manifest_mismatch')
    }
  }

  if (rows.length !== input.bundle.itemCount) blockers.push('working_cos_bundle_item_count_mismatch')
  const actualSubjects = [...new Set(rows.map(row => row.subjectId).filter(Boolean))].sort()
  const expectedSubjects = [...new Set(input.bundle.subjectIds.map(value => clean(value, 240)).filter(Boolean))].sort()
  if (JSON.stringify(actualSubjects) !== JSON.stringify(expectedSubjects)) blockers.push('working_cos_bundle_subject_manifest_mismatch')

  const uniqueBlockers = [...new Set(blockers)]
  if (uniqueBlockers.length) {
    return Object.freeze({
      profile: COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
      eligible: false,
      blockers: Object.freeze(uniqueBlockers),
      candidateId: null,
      datasetHash: null,
      trainingManifestHash: null,
      holdoutManifestHash: null,
      revisionKey: null,
      trainingRows: Object.freeze([]),
      holdoutRows: Object.freeze([]),
      trainingDispatchAuthorized: false as const,
      productionTrafficAuthorized: false as const,
    })
  }

  const datasetHash = hash({
    profile: COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
    bundleKey,
    runtimeBindingKey,
    baseModel,
    baseRevision,
    itemHashes: [...seenItemHashes].sort(),
    portableContentHashes: [...seenPortableHashes].sort(),
  })
  const candidateId = `working-cos:${hash([
    COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
    bundleKey,
    runtimeBindingKey,
    datasetHash,
  ])}`

  const bySubject = new Map<string, typeof rows>()
  for (const row of rows) {
    const current = bySubject.get(row.subjectId) || []
    current.push(row)
    bySubject.set(row.subjectId, current)
  }

  const trainingRows: typeof rows = []
  const holdoutRows: typeof rows = []
  for (const [subjectId, subjectRows] of [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...subjectRows].sort((a, b) => {
      const left = hash([candidateId, subjectId, a.portableContentHash])
      const right = hash([candidateId, subjectId, b.portableContentHash])
      return left.localeCompare(right)
    })
    const holdoutCount = Math.max(2, Math.min(8, Math.ceil(ordered.length * 0.2)))
    if (ordered.length - holdoutCount < 8) {
      return Object.freeze({
        profile: COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
        eligible: false,
        blockers: Object.freeze(['working_cos_subject_training_supply_too_small']),
        candidateId: null,
        datasetHash: null,
        trainingManifestHash: null,
        holdoutManifestHash: null,
        revisionKey: null,
        trainingRows: Object.freeze([]),
        holdoutRows: Object.freeze([]),
        trainingDispatchAuthorized: false as const,
        productionTrafficAuthorized: false as const,
      })
    }
    holdoutRows.push(...ordered.slice(0, holdoutCount))
    trainingRows.push(...ordered.slice(holdoutCount))
  }

  const trainingManifestHash = manifestHash(trainingRows.map(row => row.itemHash))
  const holdoutManifestHash = manifestHash(holdoutRows.map(row => row.itemHash))
  const revisionKey = hash({
    baseModel,
    baseModelRevision: baseRevision,
    datasetHash,
    trainingManifestHash,
    holdoutManifestHash,
  })

  return Object.freeze({
    profile: COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
    eligible: true,
    blockers: Object.freeze([]),
    candidateId,
    bundleKey,
    runtimeBindingKey,
    runtimeDigest,
    baseModel,
    baseModelRevision: baseRevision,
    baselineIdentity: input.runtimeBinding.baselineIdentity,
    rollbackArtifactRef: input.runtimeBinding.rollbackArtifactRef,
    datasetHash,
    trainingManifestHash,
    holdoutManifestHash,
    revisionKey,
    itemCount: rows.length,
    trainingItemCount: trainingRows.length,
    holdoutItemCount: holdoutRows.length,
    subjectCount: actualSubjects.length,
    subjectIds: Object.freeze(actualSubjects),
    trainingRows: Object.freeze(trainingRows),
    holdoutRows: Object.freeze(holdoutRows),
    source: `itmounts://working-cos/bundle/${bundleKey}`,
    trainingDispatchAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    nextGate: 'bounded_dataset_materialization_job' as const,
  })
}

export async function prepareWorkingCosMaterialization(input: Readonly<{
  runtimeIdentity: WorkingCosRuntimeIdentity
  podId: string
  configuredRuntimeModel: string
  bundleOptions?: WorkingCosBalancedBundleOptions
  env?: NodeJS.ProcessEnv
  dbOverride?: any
}>) {
  const db = input.dbOverride || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const bundle = await selectWorkingCosBalancedBundleFromVault(input.bundleOptions || {}, db)
  const runtimeBinding = workingCosRuntimeBindingFromEnv(
    input.runtimeIdentity,
    input.podId,
    input.configuredRuntimeModel,
    input.env || process.env,
  )
  if (!bundle.eligible || !runtimeBinding.eligible) {
    return buildWorkingCosMaterialization({ bundle, runtimeBinding, rows: [] })
  }

  const assetSetKeys = [...bundle.assetSetKeys]
  const result = await db.from('cos_university_distillation_assets')
    .select('asset_set_key,subject_id,prompt_id,prompt_text,response_text,training_text,source_item_hash,portable_content_hash,training_rights')
    .in('asset_set_key', assetSetKeys)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (result.error) throw result.error

  const rows: WorkingCosMaterializationRow[] = (result.data || []).map((row: any) => ({
    assetSetKey: clean(row.asset_set_key, 64),
    subjectId: clean(row.subject_id, 240),
    promptId: clean(row.prompt_id, 160),
    prompt: clean(row.prompt_text, 100_000),
    response: clean(row.response_text, 100_000),
    text: clean(row.training_text, 250_000),
    itemHash: clean(row.source_item_hash, 64),
    portableContentHash: clean(row.portable_content_hash, 64),
    trainingRights: clean(row.training_rights, 120),
  }))
  return buildWorkingCosMaterialization({ bundle, runtimeBinding, rows })
}
