import { createHash, createHmac } from 'node:crypto'
import { gzipSync } from 'node:zlib'

export const COS_UNIVERSITY_HF_JOBS_PROFILE = 'cos_university_huggingface_jobs_v1' as const
export const COS_UNIVERSITY_HF_EXECUTOR_PATH = '/api/internal/cos/huggingface-training-executor' as const
export const HUGGING_FACE_JOBS_API = 'https://huggingface.co' as const
const HUGGING_FACE_HUB_KNOWN_GOOD = 'huggingface_hub==1.31.0' as const

export type HuggingFaceExecutorInstall = Readonly<{
  installed: boolean
  provider: 'custom' | 'huggingface' | 'unconfigured'
  endpoint: string | null
}>

export type HuggingFaceJobsConfig = Readonly<{
  token: string
  workerUrl: string
  preparationFlavor: string
  teacherFlavor: string
  trainingFlavor: string
  preparationTimeoutSeconds: number
  teacherTimeoutSeconds: number
  trainingTimeoutSeconds: number
  maxDatasetItems: number
  maxHourlyCostUsd: number
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

export type HuggingFaceModelMetadata = Readonly<{
  modelId: string
  revision: string
  license: string
}>

export type HuggingFaceHardwareRate = Readonly<{
  flavor: string
  prettyName: string
  hourlyCostUsd: number
  accelerator: Readonly<{ type: string; model: string; manufacturer: string; quantity: string }> | null
}>

type Env = Record<string, string | undefined>
type FetchPort = (url: string, init?: RequestInit) => Promise<Response>

type TrainingEnvelope = Readonly<Record<string, unknown>> & {
  operation?: unknown
  candidateId?: unknown
  trainingDataRef?: unknown
  holdoutDataRef?: unknown
}

const HF_DATASET_REF = /^hf:\/\/datasets\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([A-Za-z0-9._-]+))?#([A-Za-z0-9_.-]+)$/
const COMMIT_SHA = /^[a-f0-9]{40}$/i
const MAX_WORKER_REQUEST_JSON_BYTES = 1_400_000

function clean(value: unknown, max = 4096): string {
  return String(value ?? '').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function positiveFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(min, Math.min(max, parsed))
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
    teacherFlavor: clean(env.COS_UNIVERSITY_HF_TEACHER_FLAVOR, 80) || 't4-small',
    // Start with the least-expensive NVIDIA GPU. We never auto-upgrade hardware or spend more
    // because of an OOM; a larger flavor must be deliberately configured after the failed run is reviewed.
    trainingFlavor: clean(env.COS_UNIVERSITY_HF_TRAINING_FLAVOR, 80) || 't4-small',
    preparationTimeoutSeconds: positiveInt(env.COS_UNIVERSITY_HF_PREPARATION_TIMEOUT_SECONDS, 1800, 300, 7200),
    teacherTimeoutSeconds: positiveInt(env.COS_UNIVERSITY_HF_TEACHER_TIMEOUT_SECONDS, 1800, 300, 3600),
    trainingTimeoutSeconds: positiveInt(env.COS_UNIVERSITY_HF_TRAINING_TIMEOUT_SECONDS, 14400, 900, 86400),
    maxDatasetItems: positiveInt(env.COS_UNIVERSITY_HF_MAX_DATASET_ITEMS, 5000, 20, 20000),
    // Owner requested sub-$1/hour hardware. Configuration may lower this ceiling, never raise it.
    maxHourlyCostUsd: positiveFloat(env.COS_UNIVERSITY_HF_MAX_HOURLY_COST_USD, 1, 0.01, 1),
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

/**
 * The provider API request carries a gzip/base64url envelope so large teacher curricula do not hit
 * the Jobs control-plane request-size ceiling. The bootstrap expands it only after the container has
 * started, then runs the existing worker contract unchanged. This also keeps explicit/custom worker
 * URLs compatible: they still receive the legacy ITMOUNTS_TRAINING_REQUEST_B64 variable in-process.
 */
function workerBootstrap(packages: readonly string[]): readonly string[] {
  const install = packages.map(item => JSON.stringify(item)).join(' ')
  const worker = `python -c "import os,base64,gzip,runpy; e=os.environ.pop('ITMOUNTS_TRAINING_REQUEST_GZIP_B64'); p='='*(-len(e)%4); raw=gzip.decompress(base64.urlsafe_b64decode(e+p)); assert len(raw)<=${MAX_WORKER_REQUEST_JSON_BYTES}; os.environ['ITMOUNTS_TRAINING_REQUEST_B64']=base64.urlsafe_b64encode(raw).rstrip(b'=').decode(); runpy.run_path('/tmp/itmounts_hf_worker.py', run_name='__main__')"`
  const shell = [
    `python -c "import os,urllib.request; urllib.request.urlretrieve(os.environ['ITMOUNTS_HF_WORKER_URL'],'/tmp/itmounts_hf_worker.py')"`,
    `pip install --quiet --disable-pip-version-check --no-cache-dir ${install}`,
    worker,
  ].join(' && ')
  return Object.freeze(['bash', '-lc', shell])
}

function teacherEnvelopeValid(envelope: TrainingEnvelope): boolean {
  const teacher = (envelope as any)?.teacher
  const student = (envelope as any)?.student
  const prompts = (envelope as any)?.prompts
  return Boolean(
    teacher && student
    && clean(teacher.modelId, 240) && COMMIT_SHA.test(clean(teacher.revision, 40)) && clean(teacher.license, 80) === 'apache-2.0'
    && clean(student.modelId, 240) && COMMIT_SHA.test(clean(student.revision, 40)) && clean(student.license, 80) === 'apache-2.0'
    && clean(teacher.modelId, 240) !== clean(student.modelId, 240)
    && Array.isArray(prompts) && prompts.length >= 20 && prompts.length <= 256
    && prompts.every((item: any) => clean(item?.id, 160) && clean(item?.prompt, 12000))
    && (envelope as any)?.trainingRights === 'open_license'
    && (envelope as any)?.studentControlledByBuyer === true
    && (envelope as any)?.containsPrivateProductionData === false
    && COMMIT_SHA.test(clean(teacher.revision, 40))
    && COMMIT_SHA.test(clean(student.revision, 40))
  )
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

  if (operation === 'generate_teacher_dataset') {
    if (!teacherEnvelopeValid(input.envelope)) throw new Error('huggingface_teacher_dataset_envelope_invalid')
    dockerImage = 'pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime'
    flavor = input.config.teacherFlavor
    timeoutSeconds = input.config.teacherTimeoutSeconds
    command = workerBootstrap([
      HUGGING_FACE_HUB_KNOWN_GOOD,
      'datasets>=3,<5',
      'transformers>=4.55,<6',
      'accelerate>=1.10,<2',
      'bitsandbytes>=0.46,<1',
    ])
  } else if (operation === 'prepare_dataset') {
    const source = (input.envelope as any)?.candidate?.source
    if (!isHuggingFaceDatasetRef(source)) throw new Error('huggingface_training_source_dataset_ref_required')
    dockerImage = 'python:3.12-slim'
    flavor = input.config.preparationFlavor
    timeoutSeconds = input.config.preparationTimeoutSeconds
    command = workerBootstrap([
      HUGGING_FACE_HUB_KNOWN_GOOD,
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
      HUGGING_FACE_HUB_KNOWN_GOOD,
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

  const requestJson = Buffer.from(JSON.stringify(input.envelope), 'utf8')
  if (requestJson.byteLength > MAX_WORKER_REQUEST_JSON_BYTES) {
    throw new Error('huggingface_training_request_too_large')
  }
  const requestGzipB64 = gzipSync(requestJson, { level: 9 }).toString('base64url')
  const digest = requestDigest(input.envelope)
  const purpose = operation === 'train'
    ? 'governed-model-training'
    : operation === 'generate_teacher_dataset'
      ? 'governed-teacher-dataset'
      : 'governed-dataset-preparation'
  return Object.freeze({
    dockerImage,
    command,
    arguments: Object.freeze([]),
    flavor,
    timeoutSeconds,
    environment: Object.freeze({
      ITMOUNTS_HF_WORKER_URL: input.config.workerUrl,
      ITMOUNTS_TRAINING_REQUEST_GZIP_B64: requestGzipB64,
      ITMOUNTS_TRAINING_REQUEST_ENCODING: 'gzip-base64url-v1',
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
      purpose,
    }),
  })
}

function modelApiUrl(modelId: string): string {
  const parts = clean(modelId, 240).split('/').filter(Boolean)
  if (parts.length !== 2) throw new Error('huggingface_model_id_invalid')
  return `${HUGGING_FACE_JOBS_API}/api/models/${parts.map(encodeURIComponent).join('/')}`
}

export async function resolveHuggingFaceModelMetadata(input: {
  modelId: string
  token: string
  fetchImpl?: FetchPort
}): Promise<HuggingFaceModelMetadata> {
  const modelId = clean(input.modelId, 240)
  const response = await (input.fetchImpl || fetch)(modelApiUrl(modelId), {
    headers: { authorization: `Bearer ${input.token}` },
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`huggingface_model_metadata_rejected:${response.status}`)
  const payload = await response.json() as any
  const resolvedId = clean(payload?.id || payload?.modelId, 240)
  const revision = clean(payload?.sha, 40).toLowerCase()
  const tagLicense = Array.isArray(payload?.tags)
    ? payload.tags.map((item: unknown) => clean(item, 120)).find((item: string) => item.startsWith('license:'))?.slice('license:'.length)
    : ''
  const license = clean(payload?.cardData?.license || tagLicense, 80).toLowerCase()
  if (resolvedId !== modelId || !COMMIT_SHA.test(revision) || !license) {
    throw new Error('huggingface_model_metadata_invalid')
  }
  if (payload?.disabled === true) throw new Error('huggingface_model_disabled')
  return Object.freeze({ modelId: resolvedId, revision, license })
}

export async function resolveHuggingFaceHardwareRate(input: {
  flavor: string
  token?: string
  fetchImpl?: FetchPort
}): Promise<HuggingFaceHardwareRate> {
  const flavor = clean(input.flavor, 80)
  if (!flavor) throw new Error('huggingface_hardware_flavor_missing')
  const headers: Record<string, string> = {}
  if (clean(input.token, 4096)) headers.authorization = `Bearer ${clean(input.token, 4096)}`
  const response = await (input.fetchImpl || fetch)(`${HUGGING_FACE_JOBS_API}/api/jobs/hardware`, {
    headers,
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`huggingface_hardware_pricing_rejected:${response.status}`)
  const payload = await response.json() as any
  const row = Array.isArray(payload) ? payload.find(item => clean(item?.name, 80) === flavor) : null
  const unitCost = Number(row?.unitCostUSD)
  const unitLabel = clean(row?.unitLabel, 40).toLowerCase()
  if (!row || !Number.isFinite(unitCost) || unitCost < 0 || !['minute', 'hour'].includes(unitLabel)) {
    throw new Error('huggingface_hardware_pricing_invalid')
  }
  const hourlyCostUsd = unitLabel === 'minute' ? unitCost * 60 : unitCost
  const accelerator = row.accelerator && typeof row.accelerator === 'object'
    ? Object.freeze({
      type: clean(row.accelerator.type, 40),
      model: clean(row.accelerator.model, 80),
      manufacturer: clean(row.accelerator.manufacturer, 80),
      quantity: clean(row.accelerator.quantity, 20),
    })
    : null
  return Object.freeze({
    flavor,
    prettyName: clean(row.prettyName, 120) || flavor,
    hourlyCostUsd: Number(hourlyCostUsd.toFixed(6)),
    accelerator,
  })
}

export async function resolveHuggingFaceNamespace(input: {
  token: string
  fetchImpl?: FetchPort
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

/**
 * Finds a provider Job by its deterministic name before creating another paid Job. This closes
 * the ambiguous window where Hugging Face accepted a POST but the response or following database
 * write was lost. Known terminal attempts are excluded by the caller so a proven failure can retry.
 */
export async function findHuggingFaceJobByName(input: {
  namespace: string
  token: string
  name: string
  excludeJobIds?: readonly string[]
  fetchImpl?: FetchPort
}): Promise<{ jobId: string; jobUrl: string; providerStage: string } | null> {
  const namespace = clean(input.namespace, 200)
  const name = clean(input.name, 240)
  if (!namespace) throw new Error('huggingface_training_namespace_missing')
  if (!name) throw new Error('huggingface_training_job_name_missing')
  const endpoint = new URL(`${HUGGING_FACE_JOBS_API}/api/jobs/${encodeURIComponent(namespace)}`)
  endpoint.searchParams.append('label', `name=${name}`)
  const response = await (input.fetchImpl || fetch)(endpoint.toString(), {
    headers: { authorization: `Bearer ${input.token}` },
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`huggingface_training_job_lookup_rejected:${response.status}`)
  const payload = await response.json() as any
  const rows: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : []
  const excluded = new Set((input.excludeJobIds || []).map(value => clean(value, 240)).filter(Boolean))
  const matches = rows
    .filter(row => clean(row?.id, 240) && !excluded.has(clean(row?.id, 240)))
    .sort((left, right) => Date.parse(clean(right?.createdAt || right?.created_at, 80)) - Date.parse(clean(left?.createdAt || left?.created_at, 80)))
  const match = matches[0]
  if (!match) return null
  const jobId = clean(match.id, 240)
  return Object.freeze({
    jobId,
    jobUrl: clean(match.url, 2000) || `https://huggingface.co/jobs/${namespace}/${jobId}`,
    providerStage: clean(match?.status?.stage || match?.stage, 40).toUpperCase() || 'UNKNOWN',
  })
}

export async function submitHuggingFaceJob(input: {
  namespace: string
  token: string
  spec: HuggingFaceJobSpec
  fetchImpl?: FetchPort
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
