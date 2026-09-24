import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { buildWorkingCosBalancedBundle } from '../lib/ai/cos/cosWorkingDistillationBundle.ts'
import {
  buildWorkingCosMaterialization,
  COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE,
} from '../lib/ai/cos/cosWorkingDistillationMaterialization.ts'
import { workingCosRuntimeBindingFromEnv } from '../lib/ai/cos/cosWorkingRuntimeBinding.ts'

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function manifest(items: readonly string[]): string {
  return hash({ items: [...items].sort() })
}
function hexId(value: number): string {
  return value.toString(16).padStart(64, '0')
}

const SUBJECTS = [
  'Computer Science & Coding',
  'Cybersecurity',
  'Statistics & Data Science',
  'Mathematics',
  'Physics & Natural Sciences',
  'Business & Operations',
  'Economics & Finance',
  'Reasoning & Decision Science',
]

function fixture() {
  const rows: Array<{
    assetSetKey: string
    subjectId: string
    promptId: string
    prompt: string
    response: string
    text: string
    itemHash: string
    portableContentHash: string
    trainingRights: string
  }> = []
  const sets = SUBJECTS.map((subjectId, subjectIndex) => {
    const assetSetKey = hexId(subjectIndex + 1)
    const setRows = Array.from({ length: 20 }, (_, itemIndex) => {
      const prompt = `Question ${subjectIndex}-${itemIndex}\nwith structure`
      const response = `Answer ${subjectIndex}-${itemIndex}\n\nwith preserved spacing`
      const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
      const row = {
        assetSetKey,
        subjectId,
        promptId: `p-${subjectIndex}-${itemIndex}`,
        prompt,
        response,
        text,
        itemHash: sha256(text),
        portableContentHash: hash({ prompt, response }),
        trainingRights: 'governed_hosted_teacher_output',
      }
      rows.push(row)
      return row
    })
    return {
      assetSetKey,
      portableManifestHash: manifest(setRows.map(row => row.portableContentHash)),
      subjectId,
      itemCount: 20,
      trainingRights: 'governed_hosted_teacher_output',
      modelNeutral: true,
      containsPrivateProductionData: false,
      createdAt: new Date(Date.UTC(2026, 8, 23, 20, subjectIndex)).toISOString(),
    }
  })

  const bundle = buildWorkingCosBalancedBundle(sets, { minSubjects: 8, maxSubjects: 8, maxItems: 200 })
  const runtimeIdentity = {
    ready: true,
    model: 'qwen3:30b',
    digest: 'ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226',
    modifiedAt: '2026-09-14T01:35:28Z',
    size: 18556699314,
    family: 'qwen3moe',
    parameterSize: '30.5B',
    quantizationLevel: 'Q4_K_M',
  } as const
  const runtimeBinding = workingCosRuntimeBindingFromEnv(runtimeIdentity, 'yvj6e9zboi7ofo', 'qwen3:30b', {})
  return { rows, bundle, runtimeBinding }
}

test('Working COS materialization creates balanced deterministic train/holdout manifests', () => {
  const { rows, bundle, runtimeBinding } = fixture()
  const first = buildWorkingCosMaterialization({ bundle, runtimeBinding, rows })
  const second = buildWorkingCosMaterialization({ bundle, runtimeBinding, rows: [...rows].reverse() })

  assert.equal(first.profile, COS_WORKING_DISTILLATION_MATERIALIZATION_PROFILE)
  assert.equal(first.eligible, true)
  assert.equal(first.subjectCount, 8)
  assert.equal(first.itemCount, 160)
  assert.equal(first.holdoutItemCount, 32)
  assert.equal(first.trainingItemCount, 128)
  assert.equal(first.datasetHash, second.datasetHash)
  assert.equal(first.trainingManifestHash, second.trainingManifestHash)
  assert.equal(first.holdoutManifestHash, second.holdoutManifestHash)
  assert.equal(first.revisionKey, second.revisionKey)
  assert.equal(first.candidateId, second.candidateId)
  assert.notEqual(first.trainingManifestHash, first.holdoutManifestHash)
  const training = new Set(first.trainingRows.map(row => row.itemHash))
  assert.ok(first.holdoutRows.every(row => !training.has(row.itemHash)))
  for (const subject of SUBJECTS) {
    assert.equal(first.holdoutRows.filter(row => row.subjectId === subject).length, 4)
    assert.equal(first.trainingRows.filter(row => row.subjectId === subject).length, 16)
  }
  assert.equal(first.trainingDispatchAuthorized, false)
  assert.equal(first.productionTrafficAuthorized, false)
  assert.equal(first.nextGate, 'bounded_dataset_materialization_job')
})

test('Working COS materialization preserves exact vaulted supervised text identity', () => {
  const { rows, bundle, runtimeBinding } = fixture()
  const materialized = buildWorkingCosMaterialization({ bundle, runtimeBinding, rows })
  assert.equal(materialized.eligible, true)
  const all = [...materialized.trainingRows, ...materialized.holdoutRows]
  const structured = all.find(row => row.prompt.includes('\nwith structure'))
  assert.ok(structured)
  assert.ok(structured.response.includes('\n\nwith preserved spacing'))
  assert.equal(sha256(structured.text), structured.itemHash)
  assert.equal(hash({ prompt: structured.prompt, response: structured.response }), structured.portableContentHash)
})

test('Working COS materialization fails closed on tampered asset text or set manifest', () => {
  const { rows, bundle, runtimeBinding } = fixture()
  const tampered = rows.map((row, index) => index === 0 ? { ...row, text: row.text + ' tampered' } : row)
  const result = buildWorkingCosMaterialization({ bundle, runtimeBinding, rows: tampered })

  assert.equal(result.eligible, false)
  assert.ok(result.blockers.includes('working_cos_asset_item_hash_mismatch'))
  assert.equal(result.trainingRows.length, 0)
  assert.equal(result.holdoutRows.length, 0)
})

test('Working COS materialization refuses an unbound runtime even with a valid bundle', () => {
  const { rows, bundle, runtimeBinding } = fixture()
  const blocked = { ...runtimeBinding, eligible: false, bindingKey: null }
  const result = buildWorkingCosMaterialization({ bundle, runtimeBinding: blocked, rows })

  assert.equal(result.eligible, false)
  assert.ok(result.blockers.includes('working_cos_runtime_binding_not_eligible'))
  assert.ok(result.blockers.includes('working_cos_runtime_binding_key_invalid'))
})
