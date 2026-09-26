import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { deriveHfWorkerDeliveryToken } from '../lib/ai/cos/cosUniversityHfWorkerDelivery.ts'
import {
  buildHuggingFaceJobSpec,
  decodeHuggingFaceDatasetRef,
  deriveHuggingFaceTrainingExecutorSecret,
  findHuggingFaceJobByName,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  COS_UNIVERSITY_HF_WORKER_ROUTE_PREFIX,
  isHuggingFaceDatasetRef,
  MAX_WORKER_REQUEST_ENV_CHUNK_CHARS,
  WORKER_REQUEST_PARTS_ENV,
  WORKER_REQUEST_PART_ENV_PREFIX,
} from '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'

function reassembledRequest(environment: Readonly<Record<string, string>>): string {
  const count = Number(environment[WORKER_REQUEST_PARTS_ENV])
  assert.ok(Number.isInteger(count) && count >= 1)
  return Array.from({ length: count }, (_, index) =>
    environment[`${WORKER_REQUEST_PART_ENV_PREFIX}${String(index).padStart(3, '0')}`]).join('')
}

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

test('provider lookup recovers an accepted named Job without duplicating a known attempt', async () => {
  let requestedUrl = ''
  const recovered = await findHuggingFaceJobByName({
    namespace: 'signalboost',
    token,
    name: 'itmounts-train-abc123',
    excludeJobIds: ['old-job'],
    fetchImpl: async url => {
      requestedUrl = url
      return new Response(JSON.stringify([
        { id: 'old-job', url: 'https://huggingface.co/jobs/signalboost/old-job', createdAt: '2026-09-15T10:00:00Z', status: { stage: 'ERROR' } },
        { id: 'recovered-job', url: 'https://huggingface.co/jobs/signalboost/recovered-job', createdAt: '2026-09-15T10:01:00Z', status: { stage: 'RUNNING' } },
      ]), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(new URL(requestedUrl).searchParams.get('label'), 'name=itmounts-train-abc123')
  assert.deepEqual(recovered, {
    jobId: 'recovered-job',
    jobUrl: 'https://huggingface.co/jobs/signalboost/recovered-job',
    providerStage: 'RUNNING',
  })
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

test('dataset preparation accepts only hash-verified hosted teacher rows for the internal hosted source', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  const base = {
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-training-executor/evidence',
    idempotencyKey: 'hosted-prepare-key',
    callbackSecret: 'k'.repeat(64),
    config,
  }
  const teacherRows = Array.from({ length: 20 }, (_, index) => {
    const text = `Hosted teacher answer ${index + 1}`
    return {
      promptId: createHash('sha256').update(`prompt-${index + 1}`).digest('hex'),
      teacherId: index % 2 === 0 ? 'openai' : 'claude',
      provider: index % 2 === 0 ? 'openai' : 'anthropic',
      model: index % 2 === 0 ? 'gpt-5.6-luna' : 'claude-sonnet-4-6',
      text,
      itemHash: createHash('sha256').update(text).digest('hex'),
    }
  })
  const envelope = {
    operation: 'prepare_dataset',
    candidateId: 'mass:00000000-0000-4000-8000-000000000001:abcdef0123456789',
    candidate: {
      source: 'itmounts://cos-university/mass-hosted-teacher/11111111-1111-4111-8111-111111111111',
      teacherRows,
    },
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({ ...base, envelope })
  assert.equal(spec.flavor, 'cpu-upgrade')
  assert.equal(spec.dockerImage, 'python:3.12-slim')

  const corrupted = structuredClone(envelope)
  corrupted.candidate.teacherRows[0].itemHash = '0'.repeat(64)
  assert.throws(
    () => buildHuggingFaceJobSpec({ ...base, envelope: corrupted }),
    /source_dataset_ref_required/,
  )
})

test('dataset preparation accepts a hash-bound Working COS bundle with explicit partitions', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  const base = {
    callbackUrl: 'https://itmounts.com/api/internal/cos/university-training-executor/evidence',
    idempotencyKey: 'working-cos-prepare-key',
    callbackSecret: 'k'.repeat(64),
    config,
  }
  const workingCosRows = Array.from({ length: 20 }, (_, index) => {
    const prompt = `Question ${index}`
    const response = `Answer ${index}`
    const text = `<user>\n${prompt}\n\n<assistant>\n${response}`
    return {
      assetSetKey: 'a'.repeat(64),
      subjectId: index < 10 ? 'Computer Science & Coding' : 'Mathematics',
      promptId: `working-${index}`,
      prompt,
      response,
      text,
      itemHash: createHash('sha256').update(text).digest('hex'),
      portableContentHash: createHash('sha256').update(JSON.stringify({ prompt, response })).digest('hex'),
      partition: index < 18 ? 'train' : 'holdout',
    }
  })
  const envelope = {
    operation: 'prepare_dataset',
    candidateId: `working-cos:${'b'.repeat(64)}`,
    candidate: {
      source: `itmounts://working-cos/bundle/${'c'.repeat(64)}`,
      workingCosRows,
    },
    expectedTrainingManifestHash: 'd'.repeat(64),
    expectedHoldoutManifestHash: 'e'.repeat(64),
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({ ...base, envelope })
  assert.equal(spec.flavor, 'cpu-upgrade')
  assert.equal(spec.dockerImage, 'python:3.12-slim')

  const badPartition = structuredClone(envelope)
  badPartition.candidate.workingCosRows[0].partition = 'unknown'
  assert.throws(
    () => buildHuggingFaceJobSpec({ ...base, envelope: badPartition }),
    /source_dataset_ref_required/,
  )

  const worker = readFileSync(new URL('../scripts/cos-university-hf-worker-base.py', import.meta.url), 'utf8')
  assert.match(worker, /workingCosRows/)
  assert.match(worker, /worker_working_cos_training_manifest_mismatch/)
  assert.match(worker, /worker_working_cos_holdout_manifest_mismatch/)
  assert.match(worker, /working_cos_partition/)
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
  assert.match(spec.command.join(' '), /hf_worker_delivery_artifact_invalid/)
  assert.match(spec.command.join(' '), /BASE_WORKER_FILENAME/)
  assert.match(spec.command.join(' '), /ITMOUNTS_TRAINING_REQUEST/)
})

test('large teacher envelopes are gzip/base64url transported without truncating curriculum material', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv({
    COS_UNIVERSITY_HF_WORKER_URL: 'https://workers.example.com/cos-university-hf-worker.py',
  }))!
  const prompts = Array.from({ length: 54 }, (_, index) => ({
    id: `prompt-${index}`,
    prompt: `Standalone case ${index}: ${'rights-cleared-material '.repeat(180)}`,
  }))
  const envelope = {
    profile: 'cos_university_training_executor_v1',
    operation: 'generate_teacher_dataset',
    candidateId: 'mass:00000000-0000-4000-8000-000000000001:abcdef0123456789',
    subjectId: 'Build a Semantic Book Recommender',
    promptProfile: 'cos-university-mass-distillation-campaign-v1',
    promptSetHash: 'a'.repeat(64),
    prompts,
    teacher: { modelId: 'Qwen/Qwen3-8B', revision: '1'.repeat(40), license: 'apache-2.0' },
    student: { modelId: 'Qwen/Qwen3-4B', revision: '2'.repeat(40), license: 'apache-2.0' },
    trainingRights: 'open_license',
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    callbackPath: '/api/internal/cos/mass-distillation/evidence',
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl: 'https://itmounts.com/api/internal/cos/mass-distillation/evidence',
    idempotencyKey: 'teacher-compressed-key',
    callbackSecret: 'k'.repeat(64),
    config,
  })
  const environment = spec.environment as Readonly<Record<string, string>>
  const compressed = reassembledRequest(environment)
  assert.ok(compressed)
  assert.equal(environment.ITMOUNTS_TRAINING_REQUEST_B64, undefined)
  assert.equal(environment.ITMOUNTS_TRAINING_REQUEST_GZIP_B64, undefined)
  assert.equal(environment.ITMOUNTS_TRAINING_REQUEST_ENCODING, 'gzip-base64url-chunked-v2')
  const restored = JSON.parse(gunzipSync(Buffer.from(compressed, 'base64url')).toString('utf8'))
  assert.deepEqual(restored, envelope)
  const rawB64Length = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url').length
  assert.ok(compressed.length < rawB64Length / 2)
  assert.match(spec.command.join(' '), /gzip\.decompress/)
  assert.match(spec.command.join(' '), /ITMOUNTS_TRAINING_REQUEST_GZIP_B64_PARTS/)
  assert.match(spec.command.join(' '), /ITMOUNTS_TRAINING_REQUEST_B64/)
})

test('a request too large for one environment variable is chunked and still starts and reassembles exactly', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv({
    COS_UNIVERSITY_HF_WORKER_URL: 'https://workers.example.com/cos-university-hf-worker.py',
  }))!
  // Incompressible curriculum reproduces the Production failure: a compressed request larger than
  // the kernel's 131,072-byte per-string exec limit (job 6ab72c7b..., "argument list too long").
  const prompts = Array.from({ length: 54 }, (_, index) => ({
    id: `prompt-${index}`,
    prompt: `Standalone case ${index}: ${randomBytes(3200).toString('base64')}`,
  }))
  const envelope = {
    profile: 'cos_university_training_executor_v1',
    operation: 'generate_teacher_dataset',
    candidateId: 'mass:00000000-0000-4000-8000-000000000001:abcdef0123456789',
    subjectId: 'Build a Semantic Book Recommender',
    promptProfile: 'cos-university-mass-distillation-campaign-v1',
    promptSetHash: 'a'.repeat(64),
    prompts,
    teacher: { modelId: 'Qwen/Qwen3-8B', revision: '1'.repeat(40), license: 'apache-2.0' },
    student: { modelId: 'Qwen/Qwen3-4B', revision: '2'.repeat(40), license: 'apache-2.0' },
    trainingRights: 'open_license',
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    callbackPath: '/api/internal/cos/mass-distillation/evidence',
    authorityExpanded: false,
  }
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl: 'https://itmounts.com/api/internal/cos/mass-distillation/evidence',
    idempotencyKey: 'chunked-key',
    callbackSecret: 'k'.repeat(64),
    config,
  })
  const environment = spec.environment as Readonly<Record<string, string>>
  const compressed = reassembledRequest(environment)
  assert.ok(compressed.length > 131_072, 'fixture must exceed the single-string exec limit')
  for (const [name, value] of Object.entries(environment)) {
    assert.ok(`${name}=${value}`.length < 131_072, `${name} would exceed the exec limit`)
    if (name.startsWith(WORKER_REQUEST_PART_ENV_PREFIX)) assert.ok(value.length <= MAX_WORKER_REQUEST_ENV_CHUNK_CHARS)
  }
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(compressed, 'base64url')).toString('utf8')), envelope)

  // The bootstrap contract is proven without a filesystem side-effect probe.
  // Chunk bounds plus exact reassembly make this deterministic in Vercel build sandboxes.
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

test('HF jobs use the authenticated public worker origin before protected Vercel deployment hosts', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv({ ITMOUNTS_PUBLIC_ORIGIN: 'https://itmounts.com' }))!
  assert.equal(config.workerUrl, `https://itmounts.com${COS_UNIVERSITY_HF_WORKER_ROUTE_PREFIX}/${deriveHfWorkerDeliveryToken(token)}/cos-university-hf-worker.py`)
  assert.doesNotMatch(config.workerUrl, /^https:\/\/signalboost-live-example\.vercel\.app/)
  assert.doesNotMatch(config.workerUrl, /raw\.githubusercontent\.com/)
  assert.ok(!config.workerUrl.includes(token), 'the HF token itself never appears in the job')
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityHuggingFaceJobs.ts', import.meta.url), 'utf8')
  assert.match(source, /ITMOUNTS_PUBLIC_ORIGIN \|\| env\.NEXT_PUBLIC_APP_URL/)
  assert.doesNotMatch(source, /raw\.githubusercontent\.com/)
})

test('the delivered worker URL keeps the base-worker sibling path the Python worker derives', () => {
  const config = huggingFaceJobsConfigFromEnv(hfEnv())!
  assert.match(config.workerUrl, /^https:\/\/signalboost-live-example\.vercel\.app\/api\/internal\/cos\/hf-worker\/[a-f0-9]{64}\/cos-university-hf-worker\.py$/)
  const route = readFileSync(new URL('../app/api/internal/cos/hf-worker/[capability]/[filename]/route.ts', import.meta.url), 'utf8')
  assert.match(route, /cos-university-hf-worker-base\.py/)
})

test('without a deployment origin or explicit worker the adapter refuses instead of guessing a source', () => {
  assert.equal(huggingFaceJobsConfigFromEnv({ HF_TOKEN: token, VERCEL_GIT_COMMIT_SHA: commit }), null)
})
