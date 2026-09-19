import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { buildHuggingFaceJobSpec, type HuggingFaceJobsConfig } from '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const config: HuggingFaceJobsConfig = {
  token: 'hf_123456789012345678901234567890',
  workerUrl: 'https://itmounts.com/api/internal/cos/hf-worker/test/cos-university-hf-worker.py',
  preparationFlavor: 'cpu-upgrade',
  teacherFlavor: 't4-small',
  trainingFlavor: 't4-small',
  preparationTimeoutSeconds: 1800,
  teacherTimeoutSeconds: 1800,
  trainingTimeoutSeconds: 14400,
  maxDatasetItems: 5000,
  maxHourlyCostUsd: 1,
}

test('hosted teacher output can be materialized without running a second teacher model', () => {
  const model = 'buyer-approved-model'
  const provider = 'openai'
  const examples = Array.from({ length: 20 }, (_, index) => {
    const prompt = `Prompt ${index} ${'x'.repeat(80)}`
    const response = `Response ${index} ${'y'.repeat(100)}`
    return {
      promptId: hash(prompt),
      prompt,
      response,
      responseHash: hash(`<user>\n${prompt}\n\n<assistant>\n${response}`),
      provider,
      model,
      requestId: `request-${index}`,
    }
  })
  const spec = buildHuggingFaceJobSpec({
    envelope: {
      operation: 'materialize_teacher_dataset',
      candidateId: 'mass:11111111-1111-1111-1111-111111111111:aaaaaaaaaaaaaaaa',
      promptSetHash: 'b'.repeat(64),
      providerManifestHash: 'c'.repeat(64),
      examples,
      teacher: { provider, modelId: model, revision: 'd'.repeat(40) },
      student: { modelId: 'Qwen/Qwen3-4B', revision: 'e'.repeat(40), license: 'apache-2.0' },
      trainingRights: 'provider_output_contractually_authorized',
      studentControlledByBuyer: true,
      containsPrivateProductionData: false,
      authorityExpanded: false,
    },
    callbackUrl: 'https://itmounts.com/api/internal/cos/mass-distillation/evidence',
    idempotencyKey: 'f'.repeat(64),
    callbackSecret: 's'.repeat(64),
    config,
  })
  assert.equal(spec.dockerImage, 'python:3.12-slim')
  assert.equal(spec.flavor, 'cpu-upgrade')
  assert.equal(spec.labels.purpose, 'governed-teacher-dataset')
  assert.doesNotMatch(spec.command.join(' '), /transformers|bitsandbytes/)
})
