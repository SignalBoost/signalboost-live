import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_DISTILLATION_ASSET_VAULT_PROFILE =
  'cos-university-distillation-asset-vault-v1' as const

const HEX64 = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i

function textValue(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function objectHash(value: unknown): string {
  return sha256(JSON.stringify(value))
}

function manifestHash(items: readonly string[]): string {
  return objectHash({ items: [...items].sort() })
}

function noHiddenReasoning(value: string): boolean {
  return !/<\/?think\b/i.test(value)
}

export type DistillationAssetRowInput = Readonly<{
  promptId?: unknown
  prompt_id?: unknown
  prompt: unknown
  response: unknown
  text: unknown
  itemHash?: unknown
  item_hash?: unknown
  teacherProvider?: unknown
  provider?: unknown
  teacherModelId?: unknown
  model?: unknown
  teacherModelRevision?: unknown
}>

export type DistillationAssetVaultInput = Readonly<{
  candidateId: unknown
  runId?: unknown
  batchKey?: unknown
  subjectId?: unknown
  promptSetHash: unknown
  sourceRef: unknown
  trainingRights: unknown
  expectedItemHashes: readonly string[]
  defaultTeacherProvider?: unknown
  defaultTeacherModelId?: unknown
  defaultTeacherModelRevision?: unknown
  rows: readonly DistillationAssetRowInput[]
}>

export function buildDistillationAssetVaultRecords(input: DistillationAssetVaultInput) {
  const candidateId = textValue(input.candidateId, 240)
  const runId = textValue(input.runId, 120) || null
  const batchKey = textValue(input.batchKey, 120) || null
  const subjectId = textValue(input.subjectId, 240) || null
  const promptSetHash = textValue(input.promptSetHash, 64).toLowerCase()
  const sourceRef = textValue(input.sourceRef, 2000)
  const trainingRights = textValue(input.trainingRights, 120)
  const expectedItemHashes = [...new Set((input.expectedItemHashes || [])
    .map(item => textValue(item, 64).toLowerCase())
    .filter(item => HEX64.test(item)))].sort()

  if (!candidateId) throw new Error('distillation_asset_candidate_missing')
  if (!HEX64.test(promptSetHash)) throw new Error('distillation_asset_prompt_set_hash_invalid')
  if (!sourceRef) throw new Error('distillation_asset_source_ref_missing')
  if (!trainingRights) throw new Error('distillation_asset_training_rights_missing')
  if (!expectedItemHashes.length || expectedItemHashes.length !== input.expectedItemHashes.length) {
    throw new Error('distillation_asset_expected_manifest_invalid')
  }
  if (!Array.isArray(input.rows) || input.rows.length !== expectedItemHashes.length) {
    throw new Error('distillation_asset_row_count_mismatch')
  }

  const rows = input.rows.map(raw => {
    const promptId = textValue(raw.promptId ?? raw.prompt_id, 160)
    const prompt = textValue(raw.prompt, 100_000)
    const response = textValue(raw.response, 100_000)
    const trainingText = textValue(raw.text, 250_000)
    const itemHash = textValue(raw.itemHash ?? raw.item_hash, 64).toLowerCase()
    const teacherProvider = textValue(raw.teacherProvider ?? raw.provider ?? input.defaultTeacherProvider, 80).toLowerCase()
    const teacherModelId = textValue(raw.teacherModelId ?? raw.model ?? input.defaultTeacherModelId, 240)
    const teacherModelRevision = textValue(raw.teacherModelRevision ?? input.defaultTeacherModelRevision, 120).toLowerCase() || null

    if (!promptId || !prompt || !response || !trainingText) {
      throw new Error('distillation_asset_supervised_pair_missing')
    }
    if (!noHiddenReasoning(response)) throw new Error('distillation_asset_hidden_reasoning_forbidden')
    if (!HEX64.test(itemHash) || sha256(trainingText) !== itemHash) {
      throw new Error('distillation_asset_item_hash_mismatch')
    }
    if (!teacherProvider || !teacherModelId) {
      throw new Error('distillation_asset_teacher_provenance_missing')
    }
    if (teacherModelRevision && teacherProvider === 'huggingface' && !HEX40.test(teacherModelRevision)) {
      throw new Error('distillation_asset_teacher_revision_invalid')
    }

    const portableContentHash = objectHash({ prompt, response })
    return Object.freeze({
      promptId,
      prompt,
      response,
      trainingText,
      itemHash,
      portableContentHash,
      teacherProvider,
      teacherModelId,
      teacherModelRevision,
    })
  })

  const observedItemHashes = [...new Set(rows.map(row => row.itemHash))].sort()
  if (observedItemHashes.length !== rows.length
    || JSON.stringify(observedItemHashes) !== JSON.stringify(expectedItemHashes)) {
    throw new Error('distillation_asset_manifest_mismatch')
  }

  const sourceDatasetHash = manifestHash(observedItemHashes)
  const portableManifestHash = manifestHash(rows.map(row => row.portableContentHash))
  const assetSetKey = objectHash({
    profile: COS_UNIVERSITY_DISTILLATION_ASSET_VAULT_PROFILE,
    candidateId,
    runId,
    batchKey,
    promptSetHash,
    sourceRef,
    sourceDatasetHash,
  })
  const teacherModels = [...new Map(rows.map(row => {
    const value = {
      provider: row.teacherProvider,
      model: row.teacherModelId,
      revision: row.teacherModelRevision,
    }
    return [JSON.stringify(value), value] as const
  })).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

  const assetRows = rows.map(row => Object.freeze({
    asset_key: objectHash([assetSetKey, row.promptId, row.itemHash]),
    asset_set_key: assetSetKey,
    candidate_id: candidateId,
    run_id: runId,
    batch_key: batchKey,
    subject_id: subjectId,
    prompt_id: row.promptId,
    prompt_set_hash: promptSetHash,
    source_item_hash: row.itemHash,
    portable_content_hash: row.portableContentHash,
    prompt_text: row.prompt,
    response_text: row.response,
    training_text: row.trainingText,
    teacher_provider: row.teacherProvider,
    teacher_model_id: row.teacherModelId,
    teacher_model_revision: row.teacherModelRevision,
    source_ref: sourceRef,
    training_rights: trainingRights,
    model_neutral: true,
    contains_private_production_data: false,
    provenance: {
      profile: COS_UNIVERSITY_DISTILLATION_ASSET_VAULT_PROFILE,
      teacherProvider: row.teacherProvider,
      teacherModelId: row.teacherModelId,
      teacherModelRevision: row.teacherModelRevision,
      sourceRef,
      sourceItemHash: row.itemHash,
      portableContentHash: row.portableContentHash,
      promptSetHash,
    },
  }))

  return Object.freeze({
    assetSetKey,
    sourceDatasetHash,
    portableManifestHash,
    itemCount: rows.length,
    assetRows: Object.freeze(assetRows),
    assetSet: Object.freeze({
      asset_set_key: assetSetKey,
      candidate_id: candidateId,
      run_id: runId,
      batch_key: batchKey,
      subject_id: subjectId,
      prompt_set_hash: promptSetHash,
      source_ref: sourceRef,
      source_dataset_hash: sourceDatasetHash,
      portable_manifest_hash: portableManifestHash,
      source_item_hashes: observedItemHashes,
      portable_content_hashes: rows.map(row => row.portableContentHash).sort(),
      item_count: rows.length,
      teacher_models: teacherModels,
      training_rights: trainingRights,
      model_neutral: true,
      contains_private_production_data: false,
      provenance: {
        profile: COS_UNIVERSITY_DISTILLATION_ASSET_VAULT_PROFILE,
        semantics: 'provider_model_provenance_separate_from_portable_prompt_response_identity',
      },
    }),
  })
}

export async function persistDistillationAssetVault(
  input: DistillationAssetVaultInput,
  dbOverride?: any,
) {
  const built = buildDistillationAssetVaultRecords(input)
  const db = dbOverride || cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  // Rows land before the set seal. If a write is interrupted, retry is idempotent and an
  // incomplete set never becomes canonical because no asset-set row exists yet.
  for (let offset = 0; offset < built.assetRows.length; offset += 100) {
    const chunk = built.assetRows.slice(offset, offset + 100)
    const inserted = await db.from('cos_university_distillation_assets')
      .upsert(chunk, { onConflict: 'asset_key', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
  }

  const sealed = await db.from('cos_university_distillation_asset_sets')
    .upsert(built.assetSet, { onConflict: 'asset_set_key', ignoreDuplicates: true })
  if (sealed.error) throw sealed.error

  return Object.freeze({
    persisted: true as const,
    assetSetKey: built.assetSetKey,
    sourceDatasetHash: built.sourceDatasetHash,
    portableManifestHash: built.portableManifestHash,
    itemCount: built.itemCount,
    semantics: 'durable_itmounts_model_neutral_distillation_asset_copy' as const,
  })
}
