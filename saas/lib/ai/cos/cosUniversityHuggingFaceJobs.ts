import { createHash, createHmac } from 'node:crypto'

export const COS_UNIVERSITY_HF_JOBS_PROFILE = 'cos_university_huggingface_jobs_v1' as const
export const COS_UNIVERSITY_HF_EXECUTOR_PATH = '/api/internal/cos/huggingface-training-executor' as const
export const HUGGING_FACE_JOBS_API = 'https://huggingface.co' as const

export type HuggingFaceExecutorInstall = Readonly<{
  installed: boolean
  provider: 'custom' | 'huggingface' | 'unconfigured'
  endpoint: string | null
}>

export type HuggingFaceJobsConfig = Readonly<{
  token: string
  workerUrl: string
  preparationFlavor: string
  trainingFlavor: string
  preparationTimeoutSeconds: number
  trainingTimeoutSeconds: number
  maxDatasetItems: number
}>

export type HuggingFaceJobSpec = Readonly<{
  dockerImage: string
  command: readonly string[]
  arguments: readonly string[]
  flavor: string
  environment: Readonly<Record<string, string>>
  secrets: Readonly<Record<string, string>>
  labels: Readonly<Record<string, string>>
  timeoutSeconds: number
}>

type Env = Record<string, string | undefined>

type TrainingEnvelope = Readonly<Record<string, unknown>> & {
  operation?: unknown
  candidateId?: unknown
  trainingDataRef?: unknown
  holdoutDataRef?: unknown
}

const HF_DATASET_REF = /^hf:\/\/datasets\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([A-Za-z0-9._-]+))?#([A-Za-z0-9_.-]+)$/
const COMMIT_SHA = /^[a-f0-9]{40}$/i

function clean(value: unknown, max = 4096): string {
  return String(value ?? '').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function deploymentOrigin(env: Env): string | null {
  const explicit = clean(env.ITMOUNTS_PUBLIC_ORIGIN || env.NEXT_PUBLIC_APP_URL, 2000)
  const candidate = explicit || (clean(env.VERCEL_URL, 1000) ? `https://${clean(env.VERCEL_URL, 1000)}` : '')
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

export function deriveHuggingFaceTrainingExecutorSecret(token: string): string {
  const normalized = clean(token, 4096)
  if (normalized.length < 20) throw new Error('huggingface_training_token_invalid')
  return createHmac('sha256', normalized)
    .update('itmounts:cos-university:huggingface-training-executor:v1')
    .digest('hex')
}

/**
 * Installs the existing signed training-executor contract over the internal Hugging Face adapter.
 * Explicit buyer-provided executor settings always win. HF_TOKEN is never copied into a URL/header
 * configuration value and the derived callback key cannot be reversed into the provider token.
 */
export function installHuggingFaceTrainingExecutorEnv(env: Env = process.env): HuggingFaceExecutorInstall {
  const existingUrl = clean(env.COS_UNIVERSITY_TRAINING_EXECUTOR_URL, 2000)
  const existingSecret = clean(env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET, 4096)
  if (existingUrl && existingSecret.length >= 32) {
    return Object.freeze({ installed: false, provider: 'custom', endpoint: existingUrl })
  }

  const token = clean(env.HF_TOKEN, 4096)
  const origin = deploymentOrigin(env)
  if (token.length < 20 || !origin) {
    return Object.freeze({ installed: false, provider: 'unconfigured', endpoint: null })
  }

  const endpoint = new URL(COS_UNIVERSITY_HF_EXECUTOR_PATH, origin).toString()
  env.COS_UNIVERSITY_TRAINING_EXECUTOR_URL = endpoint
  env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET = deriveHuggingFaceTrainingExecutorSecret(token)
  // Never enable the cost-bearing dispatch flag implicitly.
  return Object.freeze({ installed: true, provider: 'huggingface', endpoint })
}

export function huggingFaceJobsConfigFromEnv(env: Env = process.env): HuggingFaceJobsConfig | null {
  const token = clean(env.HF_TOKEN, 4096)
  if (token.length < 20) return null

  const commit = clean(env.VERCEL_GIT_COMMIT_SHA, 64)
  const explicitWorker = clean(env.COS_UNIVERSITY_HF_WORKER_URL, 2000)
  const workerUrl = explicitWorker || (COMMIT_SHA.test(commit)
    ? `https://raw.githubusercontent.com/SignalBoost/signalboost-live/${commit}/saas/scripts/cos-university-hf-worker.py`
    : '')
  if (!workerUrl) return null
  try {
    const url = new URL(workerUrl)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
  } catch {
    return null
  }

  return Object.freeze({
    token,
    workerUrl,
    preparationFlavor: clean(env.COS_UNIVERSITY_HF_PREPARATION_FLAVOR, 80) || 'cpu-upgrade',
    // Start with the least-expensive NVIDIA GPU. We never auto-upgrade hardware or spend more
    // because of an OOM; a larger flavor must be deliberately configured after the failed run is reviewed.
    trainingFlavor: clean(env.COS_UNIVERSITY_HF_TRAINING_FLAVOR, 80) || 't4-small',
    preparationTimeoutSeconds: positiveInt(env.COS_UNIVERSITY_HF_PREPARATION_TIMEOUT_SECONDS, 1800, 300, 7200),
    trainingTimeoutSeconds: positiveInt(env.COS_UNIVERSITY_HF_TRAINING_TIMEOUT_SECONDS, 14400, 900, 86400),
    maxDatasetItems: positiveInt(env.COS_UNIVERSITY_HF_MAX_DATASET_ITEMS, 5000, 20, 20000),
  })
}

export function isHuggingFaceDatasetRef(value: unknown): boolean {
  return HF_DATASET_REF.test(clean(value, 2000))
}

export function decodeHuggingFaceDatasetRef(value: unknown) {
  const match = HF_DATASET_REF.exec(clean(value, 2000))
  if (!match) return null
  return Object.freeze({ repoId: match[1], revision: match[2] || null, split: match[3] })
}

function requestDigest(input: TrainingEnvelope): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12)
}

function workerBootstrap(packages: readonly string[]): readonly string[] {
  const install = packages.map(item => JSON.stringify(item)).join(' ')
  const shell = [
    `python -c "import os,urllib.request; urllib.request.urlretrieve(os.environ['ITMOUNTS_HF_WORKER_URL'],'/tmp/itmounts_hf_worker.py')"`,
    `pip install --quiet --disable-pip-version-check --no-cache-dir ${install}`,
    'python /tmp/itmounts_hf_worker.py',
  ].join(' && ')
  return Object.freeze(['bash', '-lc', shell])
}

/**
 * Builds, but never submits, a Hugging Face Job. Submission remains behind the existing global
 * dispatch flag plus explicit owner confirmation in the University training executor.
 */
export function buildHuggingFaceJobSpec(input: {
  envelope: TrainingEnvelope
  callbackUrl: string
  idempotencyKey: string
  callbackSecret: string
  config: HuggingFaceJobsConfig
}): HuggingFaceJobSpec {
  const operation = clean(input.envelope.operation, 40)
  const candidateId = clean(input.envelope.candidateId, 120)
  if (!candidateId) throw new Error('huggingface_training_candidate_missing')
  if (!clean(input.callbackUrl, 2000).startsWith('https://')) throw new Error('huggingface_training_callback_invalid')
  if (clean(input.callbackSecret, 4096).length < 32) throw new Error('huggingface_training_callback_secret_invalid')
  if (!clean(input.idempotencyKey, 256)) throw new Error('huggingface_training_idempotency_key_missing')

  let dockerImage: string
  let flavor: string
  let timeoutSeconds: number
  let command: readonly string[]

  if (operation === 'prepare_dataset') {
    const source = (input.envelope as any)?.candidate?.source
    if (!isHuggingFaceDatasetRef(source)) throw new Error('huggingface_training_source_dataset_ref_required')
    dockerImage = 'python:3.12-slim'
    flavor = input.config.preparationFlavor
    timeoutSeconds = input.config.preparationTimeoutSeconds
    command = workerBootstrap([
      'huggingface_hub>=0.34,<2',
      'datasets>=3,<5',
    ])
  } else if (operation === 'train') {
    if (!isHuggingFaceDatasetRef(input.envelope.trainingDataRef) || !isHuggingFaceDatasetRef(input.envelope.holdoutDataRef)) {
      throw new Error('huggingface_training_materialized_dataset_refs_required')
    }
    dockerImage = 'pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime'
    flavor = input.config.trainingFlavor
    timeoutSeconds = input.config.trainingTimeoutSeconds
    command = workerBootstrap([
      'huggingface_hub>=0.34,<2',
      'datasets>=3,<5',
      'transformers>=4.55,<6',
      'accelerate>=1.10,<2',
      'peft>=0.17,<1',
      'trl>=0.23,<1',
      'bitsandbytes>=0.46,<1',
    ])
  } else {
    throw new Error('huggingface_training_operation_invalid')
  }

  const requestB64 = Buffer.from(JSON.stringify(input.envelope), 'utf8').toString('base64url')
  const digest = requestDigest(input.envelope)
  return Object.freeze({
    dockerImage,
    command,
    arguments: Object.freeze([]),
    flavor,
    timeoutSeconds,
    environment: Object.freeze({
      ITMOUNTS_HF_WORKER_URL: input.config.workerUrl,
      ITMOUNTS_TRAINING_REQUEST_B64: requestB64,
      ITMOUNTS_TRAINING_CALLBACK_URL: clean(input.callbackUrl, 2000),
      ITMOUNTS_TRAINING_IDEMPOTENCY_KEY: clean(input.idempotencyKey, 256),
      ITMOUNTS_HF_MAX_DATASET_ITEMS: String(input.config.maxDatasetItems),
      PYTHONUNBUFFERED: '1',
    }),
    secrets: Object.freeze({
      HF_TOKEN: input.config.token,
      ITMOUNTS_TRAINING_CALLBACK_SECRET: input.callbackSecret,
    }),
    labels: Object.freeze({
      name: `itmounts-${operation}-${digest}`,
      product: 'itmounts',
      subsystem: 'cos-university',
      purpose: operation === 'train' ? 'governed-model-training' : 'governed-dataset-preparation',
    }),
  })
}

export async function resolveHuggingFaceNamespace(input: {
  token: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const response = await (input.fetchImpl || fetch)(`${HUGGING_FACE_JOBS_API}/api/whoami-v2`, {
    headers: { authorization: `Bearer ${input.token}` },
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`huggingface_training_identity_rejected:${response.status}`)
  const payload = await response.json() as any
  const name = clean(payload?.name, 200)
  if (!name) throw new Error('huggingface_training_identity_invalid')
  return name
}

export async function submitHuggingFaceJob(input: {
  namespace: string
  token: string
  spec: HuggingFaceJobSpec
  fetchImpl?: typeof fetch
}): Promise<{ jobId: string; jobUrl: string }> {
  const namespace = clean(input.namespace, 200)
  if (!namespace) throw new Error('huggingface_training_namespace_missing')
  const response = await (input.fetchImpl || fetch)(`${HUGGING_FACE_JOBS_API}/api/jobs/${encodeURIComponent(namespace)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.spec),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`huggingface_training_job_rejected:${response.status}`)
  const payload = await response.json() as any
  const jobId = clean(payload?.id, 240)
  if (!jobId) throw new Error('huggingface_training_job_response_invalid')
  return Object.freeze({
    jobId,
    jobUrl: clean(payload?.url, 2000) || `https://huggingface.co/jobs/${namespace}/${jobId}`,
  })
}
