import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkingCosDatasetMaterialization } from '../lib/ai/cos/cosWorkingDistillationDataset.ts'

const PROFILE = 'cos-working-distillation-balanced-bundle-v1'
const SUBJECTS = [
  'Business & Operations',
  'Computer Science & Coding',
  'Cybersecurity',
  'Economics & Finance',
  'Language & Communication',
  'Mathematics',
  'Reasoning & Decision Science',
  'Statistics & Data Science',
] as const

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function h(value: unknown): string {
  return sha(JSON.stringify(value))
}

function manifest(items: readonly string[]): string {
  return h({ items: [...items].sort() })
}

function fixture() {
  const assetSets:any[] = []
  const assets:any[] = []
  const keys:string[] = []
  const subjectIds=[...SUBJECTS].sort()
  const portableManifestHashes:string[] = []

  SUBJECTS.forEach((subjectId, subjectIndex) => {
    const assetSetKey = sha(`set:${subjectId}`)
    keys.push(assetSetKey)
    const sourceHashes:string[] = []
    const portableHashes:string[] = []

    for (let index = 0; index < 20; index += 1) {
      const prompt = `Question ${subjectIndex}-${index} about ${subjectId}?`
      const response = `Verified lesson ${subjectIndex}-${index} for ${subjectId}.`
      const trainingText = JSON.stringify({ prompt, response })
      const itemHash = sha(trainingText)
      const portableContentHash = h({ prompt, response })
      sourceHashes.push(itemHash)
      portableHashes.push(portableContentHash)
      assets.push({
        asset_set_key: assetSetKey,
        subject_id: subjectId,
        prompt_id: `p-${subjectIndex}-${index}`,
        prompt_text: prompt,
        response_text: response,
        training_text: trainingText,
        source_item_hash: itemHash,
        portable_content_hash: portableContentHash,
      })
    }

    const portableManifestHash = manifest(portableHashes)
    portableManifestHashes.push(portableManifestHash)
    assetSets.push({
      asset_set_key: assetSetKey,
      subject_id: subjectId,
      source_dataset_hash: manifest(sourceHashes),
      portable_manifest_hash: portableManifestHash,
      item_count: 20,
      training_rights: subjectIndex % 2 ? 'open_license' : 'governed_hosted_teacher_output',
      model_neutral: true,
      contains_private_production_data: false,
    })
  })

  const combinedPortableManifestHash = h({
    profile: PROFILE,
    portableManifestHashes: [...portableManifestHashes].sort(),
  })
  const bundleKey = h({
    profile: PROFILE,
    assetSetKeys: [...keys].sort(),
    combinedPortableManifestHash,
    subjectIds,
    totalItems: 160,
  })

  return {
    candidate: {
      candidate_id: 'working-cos:' + 'a'.repeat(32),
      bundle_key: bundleKey,
      portable_manifest_hash: combinedPortableManifestHash,
      item_count: 160,
      subject_count: 8,
      subject_ids: subjectIds,
      asset_set_keys: [...keys].sort(),
    },
    assetSets,
    assets,
  }
}

test('materializes a reproducible balanced 8-subject Working-COS train/holdout dataset', () => {
  const data=fixture()
  const built=buildWorkingCosDatasetMaterialization({
    ...data,
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  })

  assert.equal(built.itemCount,160)
  assert.equal(built.subjectCount,8)
  assert.equal(built.trainingItemCount,128)
  assert.equal(built.holdoutItemCount,32)
  assert.equal(built.rows.filter(row=>row.partition==='train').length,128)
  assert.equal(built.rows.filter(row=>row.partition==='holdout').length,32)
  assert.match(built.datasetHash,/^[a-f0-9]{64}$/)
  assert.match(built.trainingManifestHash,/^[a-f0-9]{64}$/)
  assert.match(built.holdoutManifestHash,/^[a-f0-9]{64}$/)
  assert.notEqual(built.trainingManifestHash,built.holdoutManifestHash)

  for(const subject of SUBJECTS){
    const rows=built.rows.filter(row=>row.subjectId===subject)
    assert.equal(rows.length,20)
    assert.equal(rows.filter(row=>row.partition==='train').length,16)
    assert.equal(rows.filter(row=>row.partition==='holdout').length,4)
  }

  const second=buildWorkingCosDatasetMaterialization({
    ...data,
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  })
  assert.equal(second.datasetHash,built.datasetHash)
  assert.equal(second.trainingManifestHash,built.trainingManifestHash)
  assert.equal(second.holdoutManifestHash,built.holdoutManifestHash)
  assert.deepEqual(second.rows,built.rows)
})

test('rejects tampered vaulted training text rather than silently repartitioning it', () => {
  const data=fixture()
  data.assets[0]={...data.assets[0],training_text:'tampered text'}
  assert.throws(()=>buildWorkingCosDatasetMaterialization({
    ...data,
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  }),/working_cos_dataset_asset_row_invalid/)
})

test('rejects bundle or portable-manifest identity drift', () => {
  const data=fixture()
  assert.throws(()=>buildWorkingCosDatasetMaterialization({
    ...data,
    candidate:{...data.candidate,portable_manifest_hash:'c'.repeat(64)},
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  }),/working_cos_dataset_candidate_portable_manifest_mismatch/)

  assert.throws(()=>buildWorkingCosDatasetMaterialization({
    ...data,
    candidate:{...data.candidate,bundle_key:'d'.repeat(64)},
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  }),/working_cos_dataset_bundle_key_mismatch/)
})

test('rejects private or rights-ineligible source sets even if their hashes are valid', () => {
  const data=fixture()
  data.assetSets[0]={...data.assetSets[0],contains_private_production_data:true}
  assert.throws(()=>buildWorkingCosDatasetMaterialization({
    ...data,
    baseModelId:'Qwen/Qwen3-30B-A3B-Thinking-2507',
    baseModelRevision:'b'.repeat(40),
  }),/working_cos_dataset_asset_set_invalid/)
})
