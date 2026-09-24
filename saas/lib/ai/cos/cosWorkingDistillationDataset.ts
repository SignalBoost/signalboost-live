import { createHash } from 'node:crypto'
import { workingCosTrainingRightsEligible } from './cosWorkingDistillationBundle.ts'

export const COS_WORKING_DATASET_PROFILE = 'cos-working-distillation-dataset-v1' as const
export const COS_WORKING_DISPATCH_SUBJECTS = 8 as const
export const COS_WORKING_DISPATCH_MAX_ITEMS = 160 as const

const HEX64 = /^[a-f0-9]{64}$/i

function clean(value: unknown, max = 250_000): string {
  return String(value ?? '').trim().slice(0, max)
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

type CandidateRow = Readonly<{
  candidate_id: unknown
  bundle_key: unknown
  portable_manifest_hash: unknown
  item_count: unknown
  subject_count: unknown
  subject_ids: unknown
  asset_set_keys: unknown
}>

type AssetSetRow = Readonly<{
  asset_set_key: unknown
  subject_id: unknown
  source_dataset_hash: unknown
  portable_manifest_hash: unknown
  item_count: unknown
  training_rights: unknown
  model_neutral: unknown
  contains_private_production_data: unknown
}>

type AssetRow = Readonly<{
  asset_set_key: unknown
  subject_id: unknown
  prompt_id: unknown
  prompt_text: unknown
  response_text: unknown
  training_text: unknown
  source_item_hash: unknown
  portable_content_hash: unknown
}>

export type WorkingCosMaterializedRow = Readonly<{
  assetSetKey: string
  subjectId: string
  promptId: string
  prompt: string
  response: string
  text: string
  itemHash: string
  portableContentHash: string
  partition: 'train' | 'holdout'
}>

export function buildWorkingCosDatasetMaterialization(input: Readonly<{
  candidate: CandidateRow
  assetSets: readonly AssetSetRow[]
  assets: readonly AssetRow[]
  baseModelId: unknown
  baseModelRevision: unknown
}>) {
  const candidateId = clean(input.candidate.candidate_id, 160)
  const bundleKey = clean(input.candidate.bundle_key, 64).toLowerCase()
  const expectedPortableManifestHash = clean(input.candidate.portable_manifest_hash, 64).toLowerCase()
  const expectedItemCount = Number(input.candidate.item_count)
  const expectedSubjectCount = Number(input.candidate.subject_count)
  const expectedSubjectIds = Array.isArray(input.candidate.subject_ids)
    ? [...new Set(input.candidate.subject_ids.map(value => clean(value, 240)).filter(Boolean))].sort()
    : []
  const expectedAssetSetKeys = Array.isArray(input.candidate.asset_set_keys)
    ? [...new Set(input.candidate.asset_set_keys.map(value => clean(value, 64).toLowerCase()).filter(value => HEX64.test(value)))].sort()
    : []
  const baseModelId = clean(input.baseModelId, 300)
  const baseModelRevision = clean(input.baseModelRevision, 40).toLowerCase()

  if (!/^working-cos:[a-f0-9]{32}$/i.test(candidateId)) throw new Error('working_cos_dataset_candidate_invalid')
  if (!HEX64.test(bundleKey) || !HEX64.test(expectedPortableManifestHash)) throw new Error('working_cos_dataset_bundle_identity_invalid')
  if (!baseModelId || !/^[a-f0-9]{40}$/.test(baseModelRevision)) throw new Error('working_cos_dataset_base_identity_invalid')
  if (!Number.isInteger(expectedItemCount) || expectedItemCount < 20 || expectedItemCount > COS_WORKING_DISPATCH_MAX_ITEMS) {
    throw new Error('working_cos_dataset_item_count_invalid')
  }
  if (!Number.isInteger(expectedSubjectCount)
    || expectedSubjectCount !== COS_WORKING_DISPATCH_SUBJECTS
    || expectedSubjectIds.length !== expectedSubjectCount
    || expectedAssetSetKeys.length !== expectedSubjectCount) {
    throw new Error('working_cos_dataset_subject_coverage_invalid')
  }

  const setByKey = new Map<string, {
    assetSetKey: string
    subjectId: string
    sourceDatasetHash: string
    portableManifestHash: string
    itemCount: number
  }>()
  for (const raw of input.assetSets) {
    const assetSetKey = clean(raw.asset_set_key, 64).toLowerCase()
    if (!expectedAssetSetKeys.includes(assetSetKey)) continue
    const subjectId = clean(raw.subject_id, 240)
    const sourceDatasetHash = clean(raw.source_dataset_hash, 64).toLowerCase()
    const portableManifestHash = clean(raw.portable_manifest_hash, 64).toLowerCase()
    const itemCount = Number(raw.item_count)
    if (!HEX64.test(assetSetKey)
      || !subjectId
      || !expectedSubjectIds.includes(subjectId)
      || !HEX64.test(sourceDatasetHash)
      || !HEX64.test(portableManifestHash)
      || !Number.isInteger(itemCount)
      || itemCount < 20
      || raw.model_neutral !== true
      || raw.contains_private_production_data === true
      || !workingCosTrainingRightsEligible(raw.training_rights)) {
      throw new Error('working_cos_dataset_asset_set_invalid')
    }
    if (setByKey.has(assetSetKey)) throw new Error('working_cos_dataset_asset_set_duplicate')
    setByKey.set(assetSetKey, { assetSetKey, subjectId, sourceDatasetHash, portableManifestHash, itemCount })
  }
  if (setByKey.size !== expectedAssetSetKeys.length) throw new Error('working_cos_dataset_asset_set_missing')

  const rowsBySet = new Map<string, Array<Omit<WorkingCosMaterializedRow, 'partition'>>>()
  const seenItemHashes = new Set<string>()
  for (const raw of input.assets) {
    const assetSetKey = clean(raw.asset_set_key, 64).toLowerCase()
    const set = setByKey.get(assetSetKey)
    if (!set) continue
    const subjectId = clean(raw.subject_id, 240)
    const promptId = clean(raw.prompt_id, 160)
    const prompt = clean(raw.prompt_text, 100_000)
    const response = clean(raw.response_text, 100_000)
    const text = clean(raw.training_text, 250_000)
    const itemHash = clean(raw.source_item_hash, 64).toLowerCase()
    const portableContentHash = clean(raw.portable_content_hash, 64).toLowerCase()
    if (subjectId !== set.subjectId || !promptId || !prompt || !response || !text
      || !HEX64.test(itemHash) || sha256(text) !== itemHash || !HEX64.test(portableContentHash)) {
      throw new Error('working_cos_dataset_asset_row_invalid')
    }
    if (seenItemHashes.has(itemHash)) throw new Error('working_cos_dataset_duplicate_training_text')
    seenItemHashes.add(itemHash)
    const list = rowsBySet.get(assetSetKey) || []
    list.push({ assetSetKey, subjectId, promptId, prompt, response, text, itemHash, portableContentHash })
    rowsBySet.set(assetSetKey, list)
  }

  let totalItems = 0
  const portableManifestHashes: string[] = []
  for (const set of setByKey.values()) {
    const rows = rowsBySet.get(set.assetSetKey) || []
    if (rows.length !== set.itemCount) throw new Error('working_cos_dataset_asset_set_incomplete')
    if (manifestHash(rows.map(row => row.itemHash)) !== set.sourceDatasetHash) {
      throw new Error('working_cos_dataset_source_manifest_mismatch')
    }
    if (manifestHash(rows.map(row => row.portableContentHash)) !== set.portableManifestHash) {
      throw new Error('working_cos_dataset_portable_set_manifest_mismatch')
    }
    totalItems += rows.length
    portableManifestHashes.push(set.portableManifestHash)
  }
  if (totalItems !== expectedItemCount) throw new Error('working_cos_dataset_candidate_item_count_mismatch')

  const combinedPortableManifestHash = hash({
    profile: 'cos-working-distillation-balanced-bundle-v1',
    portableManifestHashes: portableManifestHashes.sort(),
  })
  if (combinedPortableManifestHash !== expectedPortableManifestHash) {
    throw new Error('working_cos_dataset_candidate_portable_manifest_mismatch')
  }
  const recomputedBundleKey = hash({
    profile: 'cos-working-distillation-balanced-bundle-v1',
    assetSetKeys: [...expectedAssetSetKeys].sort(),
    combinedPortableManifestHash,
    subjectIds: [...expectedSubjectIds].sort(),
    totalItems,
  })
  if (recomputedBundleKey !== bundleKey) throw new Error('working_cos_dataset_bundle_key_mismatch')

  const rows: WorkingCosMaterializedRow[] = []
  for (const subjectId of expectedSubjectIds) {
    const subjectRows = [...rowsBySet.values()].flat().filter(row => row.subjectId === subjectId)
      .sort((a, b) => hash([candidateId, subjectId, a.itemHash]).localeCompare(hash([candidateId, subjectId, b.itemHash])))
    if (subjectRows.length < 10) throw new Error('working_cos_dataset_subject_too_small')
    const holdoutCount = Math.max(2, Math.floor(subjectRows.length / 5))
    if (subjectRows.length - holdoutCount < 8) throw new Error('working_cos_dataset_subject_training_too_small')
    subjectRows.forEach((row, index) => rows.push(Object.freeze({
      ...row,
      partition: index < holdoutCount ? 'holdout' as const : 'train' as const,
    })))
  }

  if (rows.length !== totalItems) throw new Error('working_cos_dataset_partition_count_mismatch')
  const trainingHashes = rows.filter(row => row.partition === 'train').map(row => row.itemHash)
  const holdoutHashes = rows.filter(row => row.partition === 'holdout').map(row => row.itemHash)
  if (trainingHashes.length < 64 || holdoutHashes.length < 16) throw new Error('working_cos_dataset_partition_too_small')

  const trainingManifestHash = manifestHash(trainingHashes)
  const holdoutManifestHash = manifestHash(holdoutHashes)
  const datasetHash = hash({
    profile: COS_WORKING_DATASET_PROFILE,
    candidateId,
    bundleKey,
    baseModelId,
    baseModelRevision,
    itemHashes: rows.map(row => row.itemHash).sort(),
  })

  return Object.freeze({
    profile: COS_WORKING_DATASET_PROFILE,
    candidateId,
    bundleKey,
    portableManifestHash: combinedPortableManifestHash,
    datasetHash,
    baseModelId,
    baseModelRevision,
    itemCount: rows.length,
    trainingItemCount: trainingHashes.length,
    holdoutItemCount: holdoutHashes.length,
    subjectCount: expectedSubjectIds.length,
    subjectIds: Object.freeze(expectedSubjectIds),
    trainingManifestHash,
    holdoutManifestHash,
    rows: Object.freeze(rows),
    authorityExpanded: false as const,
    productionTrafficAuthorized: false as const,
  })
}

export async function readWorkingCosDatasetMaterialization(input: Readonly<{
  candidateId: string
  baseModelId: string
  baseModelRevision: string
}>, db: any) {
  const candidateResult = await db.from('cos_working_distillation_candidates')
    .select('candidate_id,bundle_key,portable_manifest_hash,item_count,subject_count,subject_ids,asset_set_keys,target_base_model,configured_runtime_model,baseline_identity,rollback_artifact_ref')
    .eq('candidate_id', input.candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (candidateResult.error) throw candidateResult.error
  if (!candidateResult.data) throw new Error('working_cos_dataset_candidate_missing')
  const candidate: any = candidateResult.data
  const keys = Array.isArray(candidate.asset_set_keys)
    ? candidate.asset_set_keys.map((value: unknown) => clean(value, 64).toLowerCase()).filter((value: string) => HEX64.test(value))
    : []
  if (!keys.length) throw new Error('working_cos_dataset_candidate_asset_sets_missing')

  const [setsResult, assetsResult] = await Promise.all([
    db.from('cos_university_distillation_asset_sets')
      .select('asset_set_key,subject_id,source_dataset_hash,portable_manifest_hash,item_count,training_rights,model_neutral,contains_private_production_data')
      .in('asset_set_key', keys)
      .limit(64),
    db.from('cos_university_distillation_assets')
      .select('asset_set_key,subject_id,prompt_id,prompt_text,response_text,training_text,source_item_hash,portable_content_hash')
      .in('asset_set_key', keys)
      .limit(COS_WORKING_DISPATCH_MAX_ITEMS + 8),
  ])
  if (setsResult.error) throw setsResult.error
  if (assetsResult.error) throw assetsResult.error

  return Object.freeze({
    candidate,
    materialization: buildWorkingCosDatasetMaterialization({
      candidate,
      assetSets: setsResult.data || [],
      assets: assetsResult.data || [],
      baseModelId: input.baseModelId,
      baseModelRevision: input.baseModelRevision,
    }),
  })
}
