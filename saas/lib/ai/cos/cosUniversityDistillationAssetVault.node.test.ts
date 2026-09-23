import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { buildDistillationAssetVaultRecords } from './cosUniversityDistillationAssetVault.ts'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function row(provider: string, model: string) {
  const prompt = 'Explain why an immutable training dataset helps model portability.'
  const response = 'It preserves the reusable supervised example independently of the model that consumes it.'
  const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
  return { promptId: 'case-1', prompt, response, text, itemHash: sha256(text), provider, model }
}

function build(provider: string, model: string) {
  const value = row(provider, model)
  return buildDistillationAssetVaultRecords({
    candidateId: 'study-plan:11111111-1111-4111-8111-111111111111',
    subjectId: 'reasoning_decision_science',
    promptSetHash: sha256('prompt-set'),
    sourceRef: `itmounts://teacher/${provider}`,
    trainingRights: 'governed_training_use',
    expectedItemHashes: [value.itemHash],
    rows: [value],
  })
}

test('portable content identity is independent of teacher provider/model', () => {
  const first = build('openai', 'teacher-a')
  const second = build('anthropic', 'teacher-b')
  assert.equal(
    first.assetRows[0].portable_content_hash,
    second.assetRows[0].portable_content_hash,
  )
  assert.equal(first.portableManifestHash, second.portableManifestHash)
})

test('provider/model remain provenance while stored asset is model-neutral', () => {
  const built = build('openai', 'teacher-a')
  assert.equal(built.assetRows[0].teacher_provider, 'openai')
  assert.equal(built.assetRows[0].teacher_model_id, 'teacher-a')
  assert.equal(built.assetRows[0].model_neutral, true)
  assert.equal(built.assetSet.model_neutral, true)
})

test('rejects a training row whose exact text no longer matches its source hash', () => {
  const value = row('huggingface', 'Qwen/Qwen3-8B')
  assert.throws(() => buildDistillationAssetVaultRecords({
    candidateId: 'mass:11111111-1111-4111-8111-111111111111:0123456789abcdef',
    promptSetHash: sha256('prompt-set'),
    sourceRef: 'hf://datasets/example/private@1111111111111111111111111111111111111111#train',
    trainingRights: 'open_license',
    expectedItemHashes: [value.itemHash],
    defaultTeacherProvider: 'huggingface',
    defaultTeacherModelId: 'Qwen/Qwen3-8B',
    defaultTeacherModelRevision: '1111111111111111111111111111111111111111',
    rows: [{ ...value, text: value.text + ' tampered' }],
  }), /distillation_asset_item_hash_mismatch/)
})

test('rejects hidden reasoning rather than preserving it as a reusable asset', () => {
  const prompt = 'Give the answer.'
  const response = '<think>private scratch work</think> Final answer.'
  const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
  assert.throws(() => buildDistillationAssetVaultRecords({
    candidateId: 'study-plan:11111111-1111-4111-8111-111111111111',
    promptSetHash: sha256('prompt-set'),
    sourceRef: 'itmounts://teacher/test',
    trainingRights: 'governed_training_use',
    expectedItemHashes: [sha256(text)],
    rows: [{ promptId: 'case-1', prompt, response, text, itemHash: sha256(text), provider: 'test', model: 'teacher' }],
  }), /distillation_asset_hidden_reasoning_forbidden/)
})
