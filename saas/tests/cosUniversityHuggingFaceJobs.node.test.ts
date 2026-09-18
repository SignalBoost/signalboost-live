// saas/tests/cosUniversityHuggingFaceJobs.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildHuggingFaceJobSpec,
  decodeHuggingFaceDatasetRef,
  deriveHuggingFaceTrainingExecutorSecret,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  isHuggingFaceDatasetRef,
} from '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'

const token = `hf_${'a'.repeat(48)}`
const commit = '1'.repeat(40)

function hfEnv(extra: Record<string, string | undefined> = {}) {
  return {
    HF_TOKEN: token,
    VERCEL_URL: 'signalboost-live-example.vercel.app',
    VERCEL_GIT_COMMIT_SHA: commit,
    ...extra,
  }
}

test('HF adapter installs the existing executor contract without enabling paid dispatch', () => {
  const env = hfEnv()
  const installed = installHuggingFaceTrainingExecutorEnv(env)
  assert.equal(installed.provider, 'huggingface')
  assert.equal(installed.installed, true)
  assert.equal(env.COS_UNIVERSITY_TRAINING_EXECUTOR_URL, 'https://signalboost-live-example.vercel.app/api/internal/cos/huggingface-training-executor')
  assert.ok((env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET || '').length >= 32)
  assert.notEqual(env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET, token)
  assert.equal(env.COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED, undefined)
})

test('explicit buyer-controlled executor configuration always wins over HF auto-wiring', () => {
  const env = hfEnv({
    COS_UNIVERSITY_TRAINING_EXECUTOR_URL: 'https://trainer.example.com/jobs',
    COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 's'.repeat(64),
  })
  const installed = installHuggingFaceTrainingExecutorEnv(env)
  assert.equal(installed.provider, 'custom')
  assert.equal(installed.installed, false)
  assert.equal(env.COS_UNIVERSITY_TRAINING_EXECUTOR_URL, 'https://trainer.example.com/jobs')
  assert.equal(env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET, 's'.repeat(64))
})

test('derived callback key is deterministic and does not equal the HF provider token', () => {
  const first = deriveHuggingFaceTrainingExecutorSecret(token)
  const second = deriveHuggingFaceTrainingExecutorSecret(token)
  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, token)
})

test('HF dataset references must be explicit and revision/split aware', () => {
  assert.equal(isHuggingFaceDatasetRef('hf://datasets/cadomos/training@abc123#train'), true)
  assert.deepEqual(decodeHuggingFaceDatasetRef('hf://datasets/cadomos/training@abc123#holdout'), {
    repoId: 'cadomos/training', revision: 'abc123', split: 'holdout',
  })
  assert.equal(isHuggingFaceDatasetRef('https://example.com/private.jsonl'), false)
})

test('dataset preparation stays CPU-bound and refuses arbitrary/non-HF source material', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  assert.ok(config)
  const base = {
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-training-executor/evidence',
    idempotencyKey: 'prepare-key',
    callbackSecret: 'k'.repeat(64),
    config,
  }
  assert.throws(() => buildHuggingFaceJobSpec({
    ...base,
    envelope: {
      operation: 'prepare_dataset', candidateId: 'study-plan:00000000-0000-4000-8000-000000000001',
      candidate: { source: 'private://production/transcript' }, authorityExpanded: false,
    },
  }), /source_dataset_ref_required/)

  const spec = buildHuggingFaceJobSpec({
    ...base,
    envelope: {
      operation: 'prepare_dataset', candidateId: 'study-plan:00000000-0000-4000-8000-000000000001',
      candidate: { source: 'hf://datasets/cadomos/approved-training#train' }, authorityExpanded: false,
    },
  })
  assert.equal(spec.flavor, 'cpu-upgrade')
  assert.equal(spec.dockerImage, 'python:3.12-slim')
  assert.equal(spec.environment.HF_TOKEN, undefined)
  assert.equal(spec.secrets.HF_TOKEN, token)
})

test('training defaults to the lowest-cost NVIDIA T4 and never auto-upgrades', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  assert.equal(config.trainingFlavor, 't4-small')
  const explicitlyLarger = huggingFaceJobsConfigFromEnv(hfEnv({ COS_UNIVERSITY_HF_TRAINING_FLAVOR: 'l4x1' }))!
  assert.equal(explicitlyLarger.trainingFlavor, 'l4x1')
})

test('training uses bounded GPU defaults only after immutable materialized dataset refs exist', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  const common = {
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-training-executor/evidence',
    idempotencyKey: 'train-key',
    callbackSecret: 'k'.repeat(64),
    config,
  }
  assert.throws(() => buildHuggingFaceJobSpec({
    ...common,
    envelope: {
      operation: 'train', candidateId: 'study-plan:00000000-0000-4000-8000-000000000001',
      trainingDataRef: 'missing', holdoutDataRef: 'missing', authorityExpanded: false,
    },
  }), /materialized_dataset_refs_required/)

  const spec = buildHuggingFaceJobSpec({
    ...common,
    envelope: {
      operation: 'train', candidateId: 'study-plan:00000000-0000-4000-8000-000000000001',
      trainingDataRef: 'hf://datasets/cadomos/prepared@abc123#train',
      holdoutDataRef: 'hf://datasets/cadomos/prepared@abc123#holdout',
      authorityExpanded: false,
    },
  })
  assert.equal(spec.flavor, 't4-small')
  assert.equal(spec.timeoutSeconds, 14400)
  assert.match(spec.dockerImage, /pytorch/)
  assert.equal(spec.secrets.HF_TOKEN, token)
  assert.ok(spec.command.join(' ').includes('itmounts_hf_worker.py'))
})

test('routes keep owner confirmation, signed callbacks and the global dispatch switch authoritative', () => {
  const owner = readFileSync('app/api/admin/cos-university-training-executor/route.ts', 'utf8')
  const callback = readFileSync('app/api/internal/cos/university-training-executor/evidence/route.ts', 'utf8')
  const adapter = readFileSync('app/api/internal/cos/huggingface-training-executor/route.ts', 'utf8')
  const worker = readFileSync('scripts/cos-university-hf-worker.py', 'utf8')
  assert.match(owner, /requireExplicitTrainingDispatchConfirmation/)
  assert.match(owner, /installHuggingFaceTrainingExecutorEnv/)
  assert.match(callback, /verifyTrainingExecutorPayload/)
  assert.match(adapter, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED/)
  assert.match(adapter, /verifyTrainingExecutorPayload/)
  assert.match(adapter, /submitHuggingFaceJob/)
  assert.match(worker, /partition_manifests_registered/)
  assert.match(worker, /trained_artifact_registered/)
  assert.match(worker, /rollback_artifact_registered/)
  assert.match(worker, /LoraConfig/)
  assert.match(worker, /load_in_4bit=True/)
})
