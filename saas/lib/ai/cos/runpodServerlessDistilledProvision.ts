// saas/lib/ai/cos/runpodServerlessDistilledProvision.ts
import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const SERVERLESS_API = 'https://api.runpod.ai/v2'
// Templates are looked up by name and never patched, so any change to image, ports or env only
// takes effect under a new name. The load-balancer port/health env below is exactly such a change.
export const DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v1'
export const DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v1'
// RunPod routes a QUEUE endpoint through its job handler protocol, which the public vLLM image does
// not implement. A LOAD_BALANCER endpoint routes HTTP straight to the container port instead, which
// is the only routing mode under which `vllm serve` can answer at all.
export const DISTILLED_ENDPOINT_ROUTING = 'LOAD_BALANCER' as const
export const DISTILLED_CONTAINER_PORT = 8000
export const DISTILLED_MODEL_NAME = 'itmounts-distilled-reasoning-v1'
export const DISTILLED_BASE_MODEL_ID = 'Qwen/Qwen3-4B'
export const DISTILLED_BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
export const DISTILLED_ADAPTER_MODEL_ID = 'cadomos/itmounts-student-f993a365a01e'
export const DISTILLED_ADAPTER_MODEL_REVISION = '9f03387d87de550b96d973f9f30a3f02e783997e'
export const DISTILLED_IDLE_TIMEOUT_SECONDS = 900
export const DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS = 120_000
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const REQUEST_TIMEOUT_MS = 15_000

const GPU_TYPES = [
  'NVIDIA RTX A4000',
  'NVIDIA RTX A4500',
  'NVIDIA RTX 4000 Ada Generation',
]

type RunpodTemplate = { id: string; name: string; imageName?: string; isServerless?: boolean }
type RunpodEndpoint = {
  id: string
  name: string
  workersMin?: number
  workersMax?: number
  templateId?: string
  idleTimeout?: number
  executionTimeoutMs?: number
  scalerType?: string
  scalerValue?: number
  gpuTypeIds?: string[]
}
type RunpodEndpointV2 = {
  id: string
  name: string
  type?: 'QUEUE' | 'LOAD_BALANCER'
  workers?: { min?: number; max?: number; idleTimeout?: number }
  scaling?: { type?: string; requestCount?: number; queueDelay?: number }
  timeout?: number
  flashboot?: string
}

export type RunpodServerlessHealth = Readonly<{
  ok: boolean
  httpStatus: number | null
  jobs: Readonly<{ completed: number; failed: number; inProgress: number; inQueue: number; retried: number }>
  workers: Readonly<{ idle: number; running: number }>
  error: string | null
}>

function clean(value: unknown, max = 300): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function count(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** Provider errors are useful operational evidence, but never echo arbitrary raw bodies or secrets. */
export function safeRunpodErrorDetail(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') return clean(parsed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const value = parsed as Record<string, unknown>
    const nested = value.error && typeof value.error === 'object' && !Array.isArray(value.error)
      ? value.error as Record<string, unknown>
      : null
    const candidates = [
      value.message,
      value.detail,
      typeof value.error === 'string' ? value.error : null,
      nested?.message,
      nested?.detail,
      nested?.code,
      value.code,
    ]
    const detail = candidates.map(item => clean(item)).find(Boolean) || ''
    if (!detail) return null
    return detail.replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi, '$1=[redacted]').slice(0, 300)
  } catch {
    return null
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${REST}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
    const raw = await response.text()
    if (!response.ok) {
      const detail = safeRunpodErrorDetail(raw)
      throw new Error(`RunPod REST HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return raw ? JSON.parse(raw) as T : {} as T
  } finally {
    clearTimeout(timer)
  }
}

async function requestV2<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${CONTROL_API_V2}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
    const raw = await response.text()
    if (!response.ok) {
      const detail = safeRunpodErrorDetail(raw)
      throw new Error(`RunPod REST v2 HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return raw ? JSON.parse(raw) as T : {} as T
  } finally {
    clearTimeout(timer)
  }
}

function hfToken(): string {
  const token = process.env.HF_TOKEN?.trim() || ''
  if (token.length < 20) throw new Error('HF_TOKEN is not configured for private distilled adapter access')
  return token
}

function startupCommand(): string {
  const lora = JSON.stringify({
    name: DISTILLED_MODEL_NAME,
    path: '/models/adapter',
    base_model_name: DISTILLED_BASE_MODEL_ID,
  })
  return [
    'set -euo pipefail',
    'mkdir -p /models/base /models/adapter /models/hf-cache',
    `python3 -c "from huggingface_hub import snapshot_download; import os; t=os.environ['HF_TOKEN']; snapshot_download(repo_id='${DISTILLED_BASE_MODEL_ID}', revision='${DISTILLED_BASE_MODEL_REVISION}', local_dir='/models/base', token=t); snapshot_download(repo_id='${DISTILLED_ADAPTER_MODEL_ID}', revision='${DISTILLED_ADAPTER_MODEL_REVISION}', local_dir='/models/adapter', token=t)"`,
    `exec vllm serve /models/base --host 0.0.0.0 --port 8000 --served-model-name '${DISTILLED_BASE_MODEL_ID}' --enable-lora --max-lora-rank 16 --max-loras 1 --max-cpu-loras 1 --lora-modules '${lora}' --gpu-memory-utilization 0.85 --max-model-len 16384 --dtype auto`,
  ].join('; ')
}

export function runpodServerlessOpenAiBaseUrl(endpointId: string): string {
  const id = endpointId.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  // Load-balancer endpoints are addressed on their own host, not through the job queue API.
  return `https://${id}.api.runpod.ai/v1`
}

/** Official RunPod /health view. Numeric counts only; no raw provider body or credentials escape. */
export async function runpodServerlessEndpointHealth(endpointId: string): Promise<RunpodServerlessHealth> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const id = endpointId.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  try {
    const response = await fetch(`${SERVERLESS_API}/${id}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    const raw = await response.text()
    if (!response.ok) {
      return Object.freeze({
        ok: false,
        httpStatus: response.status,
        jobs: Object.freeze({ completed: 0, failed: 0, inProgress: 0, inQueue: 0, retried: 0 }),
        workers: Object.freeze({ idle: 0, running: 0 }),
        error: safeRunpodErrorDetail(raw) || `HTTP ${response.status}`,
      })
    }
    let payload: any = null
    try { payload = JSON.parse(raw) } catch { payload = null }
    return Object.freeze({
      ok: true,
      httpStatus: response.status,
      jobs: Object.freeze({
        completed: count(payload?.jobs?.completed),
        failed: count(payload?.jobs?.failed),
        inProgress: count(payload?.jobs?.inProgress),
        inQueue: count(payload?.jobs?.inQueue),
        retried: count(payload?.jobs?.retried),
      }),
      workers: Object.freeze({
        idle: count(payload?.workers?.idle),
        running: count(payload?.workers?.running),
      }),
      error: null,
    })
  } catch (error) {
    return Object.freeze({
      ok: false,
      httpStatus: null,
      jobs: Object.freeze({ completed: 0, failed: 0, inProgress: 0, inQueue: 0, retried: 0 }),
      workers: Object.freeze({ idle: 0, running: 0 }),
      error: error instanceof Error ? clean(error.message) : 'runpod_health_failed',
    })
  }
}

/** Legacy v1 creation policy. Existing endpoint creation remains unchanged during the v2 reconcile repair. */
function legacyEndpointCreationPolicyPayload() {
  return {
    executionTimeoutMs: 300_000,
    flashboot: true,
    idleTimeout: DISTILLED_IDLE_TIMEOUT_SECONDS,
    scalerType: 'REQUEST_COUNT',
    scalerValue: 1,
    workersMax: 1,
    workersMin: 0,
  }
}

/** Current RunPod REST v2 Serverless PATCH contract. Only mutable runtime policy is sent. */
function endpointV2PolicyPayload() {
  return {
    workers: {
      min: 0,
      max: 1,
      idleTimeout: DISTILLED_IDLE_TIMEOUT_SECONDS,
    },
    scaling: {
      type: 'REQUEST_COUNT',
      requestCount: 1,
    },
    timeout: 300_000,
    flashboot: 'FLASHBOOT',
  }
}

export async function reconcileRunpodServerlessDistilledEndpoint(endpointId: string): Promise<{
  endpointId: string
  workersMin: number
  workersMax: number
  idleTimeout: number
}> {
  const id = endpointId.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  const endpoint = await requestV2<RunpodEndpointV2>(`/serverless/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(endpointV2PolicyPayload()),
  })
  if (endpoint.type && endpoint.type !== DISTILLED_ENDPOINT_ROUTING) {
    throw new Error('RunPod distilled endpoint routing no longer matches load-balancer policy')
  }
  const workersMin = Number(endpoint.workers?.min ?? 0)
  const workersMax = Number(endpoint.workers?.max ?? 1)
  const idleTimeout = Number(endpoint.workers?.idleTimeout ?? DISTILLED_IDLE_TIMEOUT_SECONDS)
  if (workersMin !== 0) throw new Error('RunPod distilled endpoint is not scale-to-zero')
  if (workersMax > 1) throw new Error('RunPod distilled endpoint exceeds the approved one-worker ceiling')
  if (idleTimeout > DISTILLED_IDLE_TIMEOUT_SECONDS) throw new Error('RunPod distilled endpoint exceeds the approved warm-window ceiling')
  if (endpoint.scaling?.type && endpoint.scaling.type !== 'REQUEST_COUNT') {
    throw new Error('RunPod distilled endpoint scaler no longer matches request-count policy')
  }
  if (Number(endpoint.scaling?.requestCount ?? 1) > 1) {
    throw new Error('RunPod distilled endpoint exceeds the approved request-count scaler threshold')
  }
  if (Number(endpoint.timeout ?? 300_000) > 300_000) {
    throw new Error('RunPod distilled endpoint exceeds the approved request timeout ceiling')
  }
  return { endpointId: endpoint.id || id, workersMin, workersMax, idleTimeout }
}

export async function provisionRunpodServerlessDistilledLlm(): Promise<{
  createdTemplate: boolean
  createdEndpoint: boolean
  templateId: string
  endpointId: string
  baseUrl: string
  model: string
  workersMin: number
  workersMax: number
  idleTimeout: number
  gpuTypes: readonly string[]
}> {
  const token = hfToken()
  const templates = await request<RunpodTemplate[]>('/templates')
  let template = templates.find(item => item.name === DISTILLED_TEMPLATE_NAME && item.isServerless !== false)
  let createdTemplate = false

  if (!template) {
    template = await request<RunpodTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: DISTILLED_TEMPLATE_NAME,
        imageName: VLLM_IMAGE,
        category: 'NVIDIA',
        containerDiskInGb: 50,
        dockerEntrypoint: ['bash', '-lc'],
        dockerStartCmd: [startupCommand()],
        env: {
          HF_TOKEN: token,
          HF_HOME: '/models/hf-cache',
          PORT: String(DISTILLED_CONTAINER_PORT),
          PORT_HEALTH: String(DISTILLED_CONTAINER_PORT),
          // vLLM answers 200 on /health only once weights are loaded, so the load balancer holds
          // traffic until the exact base+adapter runtime is actually serving.
          HEALTH_CHECK_PATH: '/health',
        },
        isPublic: false,
        isServerless: true,
        ports: [`${DISTILLED_CONTAINER_PORT}/http`],
        readme: 'iTMounts exact distilled Qwen3-4B + LoRA runtime on public vLLM image. Scale-to-zero. DeepInfra remains fallback until promotion.',
      }),
    })
    createdTemplate = true
  }

  const endpoints = await request<RunpodEndpoint[]>('/endpoints')
  let endpoint = endpoints.find(item => item.name === DISTILLED_ENDPOINT_NAME)
  let createdEndpoint = false

  if (!endpoint) {
    endpoint = await request<RunpodEndpoint>('/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: DISTILLED_ENDPOINT_NAME,
        templateId: template.id,
        computeType: 'GPU',
        // Routing mode is fixed at creation; it is deliberately absent from the PATCH policy payload.
        type: DISTILLED_ENDPOINT_ROUTING,
        // GPU constraints are creation-time-only and are deliberately not resent by reconciliation.
        gpuCount: 1,
        gpuTypeIds: GPU_TYPES,
        ...legacyEndpointCreationPolicyPayload(),
      }),
    })
    createdEndpoint = true
  }

  if (!endpoint.id) throw new Error('RunPod distilled endpoint response carried no endpoint id')
  const policy = await reconcileRunpodServerlessDistilledEndpoint(endpoint.id)

  return {
    createdTemplate,
    createdEndpoint,
    templateId: template.id,
    endpointId: endpoint.id,
    baseUrl: runpodServerlessOpenAiBaseUrl(endpoint.id),
    model: DISTILLED_MODEL_NAME,
    workersMin: policy.workersMin,
    workersMax: policy.workersMax,
    idleTimeout: policy.idleTimeout,
    gpuTypes: Object.freeze([...GPU_TYPES]),
  }
}

export async function canaryRunpodServerlessDistilledLlm(input: {
  endpointId: string
  attempts?: number
  delayMs?: number
  timeoutMs?: number
}): Promise<{ ok: boolean; model: string; httpStatus: number | null; text: string | null; error: string | null }> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const attempts = Math.max(1, Math.min(3, Math.floor(input.attempts ?? 2)))
  const delayMs = Math.max(1000, Math.min(10_000, Math.floor(input.delayMs ?? 5000)))
  const timeoutMs = Math.max(30_000, Math.min(120_000, Math.floor(input.timeoutMs ?? DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS)))
  const baseUrl = runpodServerlessOpenAiBaseUrl(input.endpointId)
  let lastStatus: number | null = null
  let lastError: string | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: DISTILLED_MODEL_NAME,
          max_tokens: 64,
          temperature: 0,
          messages: [
            { role: 'system', content: 'Return one concise sentence. Do not reveal hidden reasoning.' },
            { role: 'user', content: 'State the operational principle: evidence should be separated from inference.' },
          ],
        }),
      })
      lastStatus = response.status
      const raw = await response.text()
      if (response.ok) {
        let data: any = null
        try { data = JSON.parse(raw) } catch { data = null }
        const text = String(data?.choices?.[0]?.message?.content || '').trim()
        if (text) return { ok: true, model: DISTILLED_MODEL_NAME, httpStatus: response.status, text, error: null }
        lastError = 'distilled_canary_empty_response'
      } else {
        lastError = safeRunpodErrorDetail(raw) || `HTTP ${response.status}`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'distilled_canary_failed'
    } finally {
      clearTimeout(timer)
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return { ok: false, model: DISTILLED_MODEL_NAME, httpStatus: lastStatus, text: null, error: lastError }
}
