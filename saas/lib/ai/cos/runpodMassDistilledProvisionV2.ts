// saas/lib/ai/cos/runpodMassDistilledProvisionV2.ts
// RunPod REST v2 exact-artifact runtime for mass-distilled canaries.
// Native v2 endpoints carry their complete container configuration inline, so this path must not
// depend on the legacy v1 template index. Exact identity is verified from the materialized endpoint.
import { configuredRunpodApiKey } from './runpodConfig.ts'
import { activeResidencyRunpodEndpointNames, protectedRunpodEndpointIds } from './cosUniversityGraduateEndpointProtection.ts'
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
  massDistilledRuntimeInlineContainer,
  type MassDistilledRuntimeArtifact,
} from './runpodMassDistilledProvision.ts'
import { xsaRuntimeInlineContainer } from './runpodXsaServingRuntime.ts'
import { exactArtifactContainerImageFromEnv } from './runpodExactArtifactContainerImage.ts'

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
const IDLE_TIMEOUT_SECONDS = MASS_DISTILLED_IDLE_TIMEOUT_SECONDS
export const MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS = 720
const REQUEST_TIMEOUT_MS = 8_000
// Endpoint container/image/args/env are immutable-by-generation for this governed path. Production
// 2026-09-26 showed RunPod rejecting an in-place full inline-container PATCH with HTTP 422 while the
// stale endpoint kept the pre-baseline gateway and returned distilled_exact_model_mismatch for BASE_ID.
// Bump the endpoint generation whenever that materialized container contract changes; create the new
// exact endpoint through POST and leave PATCH for bounded worker/GPU policy only.
export const MASS_DISTILLED_EXACT_ENDPOINT_GENERATION = 'v4' as const
// Independent evaluation needs deterministic 24 GB VRAM headroom. The short exact-artifact canary,
// however, only proves boot + exact binding and historically succeeds on 16 GB. Keep evaluator/graduate
// policy 24 GB-only while allowing the canary to use RunPod's ordered 24 -> 16 GB availability fallback.
const APPROVED_POOLS = ['AMPERE_24'] as const
// Production 2026-09-24 20:34-21:01 UTC: three of five canaries ended with RunPod allocating no worker at all
// (0 ready, 0 initializing) because neither Ampere pool had capacity. ADA_24 (RTX 4090, 24 GB) is a third,
// ordered fallback for the SHORT canary only; the evaluator stays AMPERE_24-only above and narrows any
// endpoint back to it. ADA_24 costs more per hour, so every canary pool carries an explicit hourly price
// ceiling that is re-checked against RunPod's live catalog before use, and each ceiling must keep the
// worst-case canary inside the unchanged absolute $0.20 per-canary authorization.
const CANARY_APPROVED_POOLS = ['AMPERE_24', 'AMPERE_16', 'ADA_24'] as const
export const MASS_DISTILLED_CANARY_POOL_PRICE_CEILING_USD_PER_HOUR = Object.freeze({
  AMPERE_24: 0.69,
  AMPERE_16: 0.69,
  ADA_24: 1.10,
} as const)
// Conservative worst case: full readiness wait + full first-request window + idle scale-down tail.
export const MASS_DISTILLED_CANARY_WORST_CASE_BILLED_SECONDS =
  MASS_DISTILLED_READY_TIMEOUT_MS / 1000 + MASS_DISTILLED_CANARY_TIMEOUT_MS / 1000 + MASS_DISTILLED_IDLE_TIMEOUT_SECONDS
// Used only when the live catalog cannot be read: the pools that were already approved at the old $0.69 cap.
const CANARY_CATALOG_UNAVAILABLE_POOLS = ['AMPERE_24', 'AMPERE_16'] as const

type CatalogGpu = { pool?: string; manufacturer?: string; memory?: number; availability?: string; price?: { serverless?: number | null } }

export function massDistilledCanaryWorstCaseCostUsd(pricePerHourUsd: number): number {
  return (MASS_DISTILLED_CANARY_WORST_CASE_BILLED_SECONDS * pricePerHourUsd) / 3600
}

/**
 * Pure pool selection. A canary pool is used only when RunPod's catalog shows an available NVIDIA 16-24 GB GPU
 * in it at or below that pool's explicit hourly ceiling, and that price keeps the worst-case canary inside the
 * absolute per-canary cost authorization. Order is preserved (cheapest pools first).
 */
function qualifyingCanaryCatalogPrice(gpu: CatalogGpu, pool: typeof CANARY_APPROVED_POOLS[number]): number | null {
  const price = Number(gpu?.price?.serverless)
  const memory = Number(gpu?.memory || 0)
  const ceiling = MASS_DISTILLED_CANARY_POOL_PRICE_CEILING_USD_PER_HOUR[pool]
  if (clean(gpu?.pool, 80) !== pool
    || clean(gpu?.manufacturer, 40).toUpperCase() !== 'NVIDIA'
    || memory < 16 || memory > 24
    || clean(gpu?.availability, 40).toUpperCase() === 'NONE'
    || !Number.isFinite(price) || price <= 0 || price > ceiling
    || massDistilledCanaryWorstCaseCostUsd(price) > MASS_DISTILLED_CANARY_MAX_COST_USD) return null
  return price
}

export function selectMassDistilledCanaryPools(gpus: readonly CatalogGpu[] | null | undefined): string[] {
  if (!Array.isArray(gpus)) return [...CANARY_CATALOG_UNAVAILABLE_POOLS]
  return CANARY_APPROVED_POOLS.filter(pool => gpus.some(gpu => qualifyingCanaryCatalogPrice(gpu, pool) !== null))
}

export function massDistilledCanaryCatalogPriceSnapshot(
  gpus: readonly CatalogGpu[] | null | undefined,
  pools: readonly string[],
): Readonly<Record<string, number>> {
  if (!Array.isArray(gpus)) return Object.freeze({})
  const prices: Record<string, number> = {}
  for (const pool of CANARY_APPROVED_POOLS) {
    if (!pools.includes(pool)) continue
    const qualifying = gpus
      .map(gpu => qualifyingCanaryCatalogPrice(gpu, pool))
      .filter((price): price is number => price !== null)
    if (qualifying.length) prices[pool] = Math.min(...qualifying)
  }
  return Object.freeze(prices)
}

export async function massDistilledServerlessWorkerCapacity() {
  const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
  const endpoints = listed.endpoints || []
  const reservedWorkers = endpoints.reduce((total, endpoint) =>
    total + Math.max(0, Math.floor(Number(endpoint.workers?.max ?? 0))), 0)
  const configured = Number(process.env.RUNPOD_SERVERLESS_WORKER_QUOTA || '10')
  const quota = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 10
  return Object.freeze({
    reservedWorkers,
    quota,
    availableWorkers: Math.max(0, quota - reservedWorkers),
  })
}

type Template = { id?: string; name?: string; isServerless?: boolean }
type Endpoint = {
  id?: string
  name?: string
  type?: 'QUEUE' | 'LOAD_BALANCER'
  image?: string
  args?: string
  disk?: number
  ports?: string[]
  env?: Record<string, unknown>
  workers?: { min?: number; max?: number; idleTimeout?: number }
  gpu?: { pools?: string[]; count?: number }
  scaling?: { type?: 'REQUEST_COUNT' | 'QUEUE_DELAY'; requestCount?: number; queueDelay?: number }
  timeout?: number
  flashboot?: 'OFF' | 'FLASHBOOT' | 'PRIORITY_FLASHBOOT'
}
type RestEndpointIdentity = { id?: string; name?: string }

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
      templateName: `itmounts-mass-distilled-${suffix}-${runtimeKey}-template-v4`,
      endpointName: `itmounts-mass-distilled-${suffix}-${runtimeKey}-${MASS_DISTILLED_EXACT_ENDPOINT_GENERATION}`,
      modelName: `itmounts-mass-distilled-${suffix}-${runtimeKey}`,
    }
  }
  return {
    templateName: `itmounts-mass-distilled-${suffix}-v2`,
    endpointName: `itmounts-mass-distilled-${suffix}-${MASS_DISTILLED_EXACT_ENDPOINT_GENERATION}`,
    modelName: `itmounts-mass-distilled-${suffix}`,
  }
}

function runtimeIdleTimeoutSeconds(input: MassDistilledRuntimeArtifact) {
  if (input.idleTimeoutSeconds === undefined) return IDLE_TIMEOUT_SECONDS
  const value = Number(input.idleTimeoutSeconds)
  if (!Number.isInteger(value) || value < IDLE_TIMEOUT_SECONDS || value > MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS) {
    throw new Error('mass_distilled_runtime_idle_timeout_invalid')
  }
  return value
}

function assertNonGpuEndpointSafetyPolicy(endpoint: Endpoint, idleTimeoutSeconds = IDLE_TIMEOUT_SECONDS) {
  if (endpoint.type !== ROUTING) throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if (Number(endpoint.workers?.min ?? Number.NaN) !== 0
    || Number(endpoint.workers?.max ?? Number.NaN) > 1
    || Number(endpoint.workers?.idleTimeout ?? Number.NaN) > idleTimeoutSeconds) {
    throw new Error('mass_distilled_runtime_endpoint_worker_policy_drift')
  }
  if (Number(endpoint.gpu?.count ?? Number.NaN) !== 1) throw new Error('mass_distilled_runtime_endpoint_gpu_count_drift')
}

function assertEndpointSafetyPolicy(
  endpoint: Endpoint,
  idleTimeoutSeconds = IDLE_TIMEOUT_SECONDS,
  approvedPools: readonly string[] = APPROVED_POOLS,
) {
  assertNonGpuEndpointSafetyPolicy(endpoint, idleTimeoutSeconds)
  const pools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
  if (pools.length !== approvedPools.length || !approvedPools.every(pool => pools.includes(pool))) {
    throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
  }
}

function runpodWorkerQuotaError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .toLowerCase().includes('max workers across all endpoints must not exceed your workers quota')
}

async function withWorkerQuotaRecovery<T>(activeEndpointId: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!runpodWorkerQuotaError(error)) throw error
      lastError = error
      await releaseOtherMassEndpointCapacity(activeEndpointId)
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('mass_distilled_runtime_worker_quota_full')
}

const RUNPOD_PRIMARY_ENDPOINT_NAMES = new Set(['itmounts-distilled-reasoning-primary'])

async function releaseOtherMassEndpointCapacity(activeEndpointId: string) {
  const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
  const [protectedEndpointIds, protectedResidencyEndpointNames] = await Promise.all([
    protectedRunpodEndpointIds(),
    activeResidencyRunpodEndpointNames(),
  ])
  // RunPod's worker quota is account-wide, so recovery must inventory the whole account rather
  // than only the current mass-distilled naming generation. Protection is authoritative: active
  // graduates, evaluations, canaries, the active endpoint, and live Residency leases are never
  // reclaimed. Every other scale-to-zero reservation is stale/reclaimable capacity, including
  // XSA and legacy distilled lanes.
  const reclaimable = (listed.endpoints || []).filter(endpoint =>
    clean(endpoint.id, 160) !== activeEndpointId
    && !protectedEndpointIds.has(clean(endpoint.id, 160).toLowerCase())
    && !protectedResidencyEndpointNames.has(clean(endpoint.name, 240))
    && !RUNPOD_PRIMARY_ENDPOINT_NAMES.has(clean(endpoint.name, 240).toLowerCase())
    && Number(endpoint.workers?.min ?? 0) === 0
    && Number(endpoint.workers?.max ?? 0) > 0)
  for (const endpoint of reclaimable) {
    if (!endpoint.id) continue
    const idleTimeout = Math.min(Number(endpoint.workers?.idleTimeout ?? IDLE_TIMEOUT_SECONDS), IDLE_TIMEOUT_SECONDS)
    await requestV2<Endpoint>(`/serverless/${encodeURIComponent(endpoint.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout } }),
    })
  }
  return reclaimable.length
}

async function resolveEndpointControlPlane(endpointId: string, endpointName = ''): Promise<Endpoint> {
  let observedId = clean(endpointId, 160)
  const observedName = clean(endpointName, 240)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
    const endpoint = (listed.endpoints || []).find(item =>
      (observedId && clean(item.id, 160) === observedId)
      || (observedName && clean(item.name, 240) === observedName))
    if (endpoint?.id) return endpoint

    if (observedName) {
      const official = await requestV1<RestEndpointIdentity[]>('/endpoints')
      const identity = official.find(item =>
        clean(item.name, 240) === observedName && clean(item.id, 160))
      if (identity?.id) observedId = clean(identity.id, 160)
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)))
  }
  throw new Error('mass_distilled_runtime_endpoint_id_missing')
}

async function constrainEndpointToApprovedGpu(
  endpointId: string,
  endpointName = '',
  idleTimeoutSeconds = IDLE_TIMEOUT_SECONDS,
  approvedPools: readonly string[] = APPROVED_POOLS,
) {
  let endpoint = await resolveEndpointControlPlane(endpointId, endpointName)
  assertNonGpuEndpointSafetyPolicy(endpoint, idleTimeoutSeconds)
  const currentPools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
  if (!approvedPools.some(pool => currentPools.includes(pool))) {
    const exact24Only = approvedPools.length === 1 && approvedPools[0] === 'AMPERE_24'
    throw new Error(exact24Only ? 'mass_distilled_runtime_24gb_pool_unavailable' : 'mass_distilled_runtime_approved_gpu_pool_unavailable')
  }
  if (currentPools.length === approvedPools.length && approvedPools.every(pool => currentPools.includes(pool))) return endpoint

  const patchGpu = () => requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint?.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ gpu: { pools: [...approvedPools], count: 1 } }),
  })
  try {
    endpoint = await withWorkerQuotaRecovery(String(endpoint.id), patchGpu)
  } catch (error) {
    // RunPod validates the account-wide worker quota on otherwise unrelated endpoint PATCHes. At
    // exactly quota, a safe GPU-pool narrowing can therefore be rejected even after every disposable
    // sibling mass endpoint was retired. Drain only THIS exact mass endpoint's existing max-1
    // reservation, apply the GPU-only patch, then restore the same bounded max-1 envelope. This
    // temporarily reduces capacity; it never touches unknown endpoints or widens worker authority.
    const endpointName = clean(endpoint.name, 240)
    const originalMaxWorkers = Math.max(0, Math.min(1, Math.floor(Number(endpoint.workers?.max ?? 0))))
    if (!runpodWorkerQuotaError(error)
      || originalMaxWorkers < 1
      || !endpointName.startsWith('itmounts-mass-distilled-')) {
      throw error
    }
    const drained = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
      method: 'PATCH',
      body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: idleTimeoutSeconds } }),
    })
    if (!drained?.id || Number(drained.workers?.max ?? Number.NaN) !== 0) {
      throw new Error('mass_distilled_runtime_quota_self_drain_rejected')
    }
    assertNonGpuEndpointSafetyPolicy(drained, idleTimeoutSeconds)
    endpoint = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(drained.id))}`, {
      method: 'PATCH',
      body: JSON.stringify({ gpu: { pools: [...approvedPools], count: 1 } }),
    })
    if (!endpoint?.id) throw new Error('mass_distilled_runtime_gpu_pool_rebind_missing')
    endpoint = await restoreRetiredEndpointCapacity(endpoint, idleTimeoutSeconds, approvedPools)
  }
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_gpu_pool_rebind_missing')
  assertEndpointSafetyPolicy(endpoint, idleTimeoutSeconds, approvedPools)
  return endpoint
}

/**
 * A newer artifact's canary releases every other mass-distilled endpoint's reserved capacity by setting
 * max workers to 0. Evaluation runs up to 12 hours after its own canary, so by then its endpoint can no