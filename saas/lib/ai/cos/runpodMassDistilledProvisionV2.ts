// RunPod REST v2 compatibility repair for exact-artifact mass-distilled canaries.
// v2 applies templateId as a one-time materialization; it does not retain a persistent template link.
import { configuredRunpodApiKey } from './runpodConfig.ts'
import {
  MASS_DISTILLED_CANARY_MAX_COST_USD,
  MASS_DISTILLED_MAX_CANARY_INVOCATIONS,
  MASS_DISTILLED_READY_TIMEOUT_MS,
  MASS_DISTILLED_CANARY_TIMEOUT_MS,
  MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
  MASS_DISTILLED_REQUEST_TIMEOUT_MS,
  MASS_DISTILLED_HEALTH_TIMEOUT_MS,
  canaryMassDistilledRuntime,
  massDistilledRuntimeHealth,
  provisionMassDistilledRuntime as provisionLegacyMassDistilledRuntime,
  type MassDistilledRuntimeArtifact,
} from './runpodMassDistilledProvision.ts'

export {
  MASS_DISTILLED_CANARY_MAX_COST_USD,
  MASS_DISTILLED_MAX_CANARY_INVOCATIONS,
  MASS_DISTILLED_READY_TIMEOUT_MS,
  MASS_DISTILLED_CANARY_TIMEOUT_MS,
  MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
  MASS_DISTILLED_REQUEST_TIMEOUT_MS,
  MASS_DISTILLED_HEALTH_TIMEOUT_MS,
  canaryMassDistilledRuntime,
  massDistilledRuntimeHealth,
}
export type { MassDistilledRuntimeArtifact }

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
const ROUTING = 'LOAD_BALANCER' as const
const PUBLIC_PORT = 8000
const IDLE_TIMEOUT_SECONDS = 60
const REQUEST_TIMEOUT_MS = 8_000
// Production mass-evaluation evidence on 2026-09-17 showed the exact LoRA candidate repeatedly
// returning HTTP 502 after ~40s while the same endpoint passed the short exact-artifact canary and
// the base-model holdout calls succeeded. Keep the existing 24 GB Ampere pool and remove the 16 GB
// option for this exact-artifact runtime so long-form evaluator generation has deterministic VRAM headroom.
const APPROVED_POOLS = ['AMPERE_24'] as const

type Template = { id?: string; name?: string; isServerless?: boolean }
type Endpoint = {
  id?: string
  name?: string
  type?: 'QUEUE' | 'LOAD_BALANCER'
  image?: string
  args?: string
  ports?: string[]
  env?: Record<string, unknown>
  workers?: { min?: number; max?: number; idleTimeout?: number }
  gpu?: { pools?: string[]; count?: number }
}

const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function safeError(raw: string): string | null {
  try {
    const value: any = JSON.parse(raw)
    const detail = [value?.message, value?.detail, typeof value?.error === 'string' ? value.error : null, value?.error?.message]
      .map(item => clean(item))
      .find(Boolean) || ''
    return detail ? detail.replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi, '$1=[redacted]').slice(0, 300) : null
  } catch {
    return null
  }
}

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const raw = await response.text()
  if (!response.ok) {
    const detail = safeError(raw)
    throw new Error(`RunPod ${String(init.method || 'GET').toUpperCase()} ${path} HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return raw ? JSON.parse(raw) as T : {} as T
}

const requestV1 = <T>(path: string, init: RequestInit = {}) => request<T>(REST_V1, path, init)
const requestV2 = <T>(path: string, init: RequestInit = {}) => request<T>(CONTROL_API_V2, path, init)

function identity(input: MassDistilledRuntimeArtifact) {
  const suffix = input.artifactHash.slice(0, 12).toLowerCase()
  const runtimeKey = clean(input.runtimeKey, 32).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
  if (runtimeKey) {
    return {
      templateName: `itmounts-mass-distilled-${suffix}-${runtimeKey}-v3`,
      endpointName: `itmounts-mass-distilled-${suffix}-${runtimeKey}-v3`,
      modelName: `itmounts-mass-distilled-${suffix}-${runtimeKey}`,
    }
  }
  return {
    templateName: `itmounts-mass-distilled-${suffix}-v2`,
    endpointName: `itmounts-mass-distilled-${suffix}-v2`,
    modelName: `itmounts-mass-distilled-${suffix}`,
  }
}

function assertNonGpuEndpointSafetyPolicy(endpoint: Endpoint) {
  if (endpoint.type !== ROUTING) throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if (Number(endpoint.workers?.min ?? Number.NaN) !== 0
    || Number(endpoint.workers?.max ?? Number.NaN) > 1
    || Number(endpoint.workers?.idleTimeout ?? Number.NaN) > IDLE_TIMEOUT_SECONDS) {
    throw new Error('mass_distilled_runtime_endpoint_worker_policy_drift')
  }
  if (Number(endpoint.gpu?.count ?? Number.NaN) !== 1) throw new Error('mass_distilled_runtime_endpoint_gpu_count_drift')
}

function assertEndpointSafetyPolicy(endpoint: Endpoint) {
  assertNonGpuEndpointSafetyPolicy(endpoint)
  const pools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
  if (pools.length !== APPROVED_POOLS.length || !APPROVED_POOLS.every(pool => pools.includes(pool))) {
    throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
  }
}

async function constrainEndpointToApprovedGpu(endpointId: string) {
  const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
  let endpoint = (listed.endpoints || []).find(item => clean(item.id, 160) === endpointId)
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_id_missing')
  assertNonGpuEndpointSafetyPolicy(endpoint)
  const currentPools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
  if (!currentPools.includes(APPROVED_POOLS[0])) throw new Error('mass_distilled_runtime_24gb_pool_unavailable')
  if (currentPools.length === APPROVED_POOLS.length && APPROVED_POOLS.every(pool => currentPools.includes(pool))) return endpoint

  endpoint = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(endpoint.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ gpu: { pools: [...APPROVED_POOLS], count: 1 } }),
  })
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_gpu_pool_rebind_missing')
  assertEndpointSafetyPolicy(endpoint)
  return endpoint
}

/** Enforce the already-approved 24GB exact-artifact endpoint policy before evaluator inference. */
export async function ensureMassDistilledEndpoint24Gb(endpointId: string) {
  const endpoint = await constrainEndpointToApprovedGpu(clean(endpointId, 160))
  return Object.freeze({
    endpointId: String(endpoint.id),
    gpuPools: Object.freeze([...(endpoint.gpu?.pools || [])]),
    gpuCount: Number(endpoint.gpu?.count),
    workersMin: Number(endpoint.workers?.min),
    workersMax: Number(endpoint.workers?.max),
    idleTimeout: Number(endpoint.workers?.idleTimeout),
  })
}

function materializedEndpointMatches(endpoint: Endpoint, input: MassDistilledRuntimeArtifact, modelName: string) {
  const args = clean(endpoint.args, 20_000)
  const ports = endpoint.ports || []
  const env = endpoint.env || {}
  return endpoint.image === VLLM_IMAGE
    && args.includes(BASE_MODEL_REVISION)
    && args.includes(input.artifactRevision)
    && args.includes(input.artifactId)
    && args.includes(modelName)
    && args.includes('itmounts_mass_gateway.py')
    && ports.includes(`${PUBLIC_PORT}/http`)
    && clean(env.HF_HOME, 200) === '/models/hf-cache'
    && clean(env.PORT, 40) === String(PUBLIC_PORT)
    && clean(env.PORT_HEALTH, 40) === String(PUBLIC_PORT)
    && clean(env.HEALTH_CHECK_PATH, 80) === '/ping'
}

function assertMaterializedEndpointIdentity(endpoint: Endpoint, input: MassDistilledRuntimeArtifact, modelName: string) {
  assertEndpointSafetyPolicy(endpoint)
  if (!materializedEndpointMatches(endpoint, input, modelName)) {
    throw new Error('mass_distilled_runtime_materialized_identity_mismatch')
  }
}

async function resolveExactEndpoint(input: MassDistilledRuntimeArtifact) {
  const ids = identity(input)
  const templates = await requestV1<Template[]>('/templates')
  const template = templates.find(item => clean(item.name, 240) === ids.templateName && item.isServerless !== false)
  if (!template?.id) throw new Error('mass_distilled_runtime_template_id_missing')

  const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
  let endpoint = (listed.endpoints || []).find(item => clean(item.name, 240) === ids.endpointName)
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_id_missing')
  endpoint = await constrainEndpointToApprovedGpu(String(endpoint.id))

  if (materializedEndpointMatches(endpoint, input, ids.modelName)) {
    return Object.freeze({ endpoint, ...ids, reboundTemplate: false })
  }

  endpoint = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(endpoint.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ templateId: template.id }),
  })
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_template_rebind_missing')
  endpoint = await constrainEndpointToApprovedGpu(String(endpoint.id))
  assertMaterializedEndpointIdentity(endpoint, input, ids.modelName)
  return Object.freeze({ endpoint, ...ids, reboundTemplate: true })
}

/**
 * Preserve the proven creator first. Compatibility recovery handles provider response/identity drift,
 * but only after the exact approval-scoped endpoint passes the non-template safety policy.
 */
export async function provisionMassDistilledRuntime(input: MassDistilledRuntimeArtifact) {
  try {
    const provisioned = await provisionLegacyMassDistilledRuntime(input)
    const endpoint = await constrainEndpointToApprovedGpu(String(provisioned.endpointId))
    return Object.freeze({
      ...provisioned,
      workersMin: Number(endpoint.workers?.min),
      workersMax: Number(endpoint.workers?.max),
      idleTimeout: Number(endpoint.workers?.idleTimeout),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message !== 'mass_distilled_runtime_template_identity_mismatch'
      && message !== 'mass_distilled_runtime_endpoint_template_mismatch'
      && message !== 'mass_distilled_runtime_endpoint_template_rebind_failed') throw error

    const recovered = await resolveExactEndpoint(input)
    const endpoint = recovered.endpoint
    assertMaterializedEndpointIdentity(endpoint, input, recovered.modelName)
    return Object.freeze({
      templateName: recovered.templateName,
      endpointName: recovered.endpointName,
      modelName: recovered.modelName,
      endpointId: String(endpoint.id),
      createdTemplate: false,
      createdEndpoint: false,
      reboundTemplate: recovered.reboundTemplate,
      workersMin: Number(endpoint.workers?.min),
      workersMax: Number(endpoint.workers?.max),
      idleTimeout: Number(endpoint.workers?.idleTimeout),
      baseUrl: `https://${endpoint.id}.api.runpod.ai/v1`,
    })
  }
}
