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
 * longer start a worker and the readiness probe gets no response at all
 * (Production 2026-09-17: `mass_distilled_evaluation_runtime_not_ready:network` on mass:8f5af666 and
 * mass:481a6760, whose endpoint showed 0 running workers and $0.00 billed). Restoring the one worker this
 * endpoint is allowed keeps the single-active-endpoint rule intact and creates nothing.
 */
async function restoreRetiredEndpointCapacity(
  endpoint: Endpoint,
  idleTimeoutSeconds = IDLE_TIMEOUT_SECONDS,
  approvedPools: readonly string[] = APPROVED_POOLS,
) {
  const maxWorkers = Number(endpoint.workers?.max ?? Number.NaN)
  const idleTimeout = Number(endpoint.workers?.idleTimeout ?? Number.NaN)
  if (maxWorkers >= 1 && idleTimeout === idleTimeoutSeconds) return endpoint
  const restore = () => requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ workers: { min: 0, max: 1, idleTimeout: idleTimeoutSeconds } }),
  })
  const restored = await withWorkerQuotaRecovery(String(endpoint.id), restore)
  if (!restored?.id) throw new Error('mass_distilled_runtime_capacity_restore_missing')
  if (Number(restored.workers?.max ?? Number.NaN) !== 1) throw new Error('mass_distilled_runtime_capacity_restore_rejected')
  assertEndpointSafetyPolicy(restored, idleTimeoutSeconds, approvedPools)
  return restored
}

/** Enforce the already-approved 24GB exact-artifact endpoint policy before evaluator inference. */
export async function ensureMassDistilledEndpoint24Gb(endpointId: string) {
  const endpoint = await restoreRetiredEndpointCapacity(
    await constrainEndpointToApprovedGpu(clean(endpointId, 160), '', IDLE_TIMEOUT_SECONDS, APPROVED_POOLS),
    IDLE_TIMEOUT_SECONDS,
    APPROVED_POOLS,
  )
  return Object.freeze({
    endpointId: String(endpoint.id),
    gpuPools: Object.freeze([...(endpoint.gpu?.pools || [])]),
    gpuCount: Number(endpoint.gpu?.count),
    workersMin: Number(endpoint.workers?.min),
    workersMax: Number(endpoint.workers?.max),
    idleTimeout: Number(endpoint.workers?.idleTimeout),
  })
}

/** Realize the evaluator's already-authorized single runtime wake without widening authority. */
export async function activateMassDistilledEvaluationWorker(endpointId: string) {
  const endpoint = await resolveEndpointControlPlane(clean(endpointId, 160))
  assertEndpointSafetyPolicy(endpoint, IDLE_TIMEOUT_SECONDS, APPROVED_POOLS)
  const activate = () => requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ workers: { min: 1, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
  })
  let activated: Endpoint
  try {
    activated = await withWorkerQuotaRecovery(String(endpoint.id), activate)
  } catch (error) {
    // RunPod revalidates the account-wide max-worker quota even when this exact endpoint already
    // owns max=1 and the patch only changes min=0 -> min=1. At 10/10 that can reject a legitimate
    // evaluator wake after every disposable sibling has already been retired. Release only THIS
    // exact mass endpoint's existing max-1 reservation, then restore the identical min=1/max=1
    // envelope. Capacity never exceeds the pre-existing bound and protected/unrelated endpoints
    // remain untouched.
    const endpointName = clean(endpoint.name, 240)
    if (!runpodWorkerQuotaError(error)
      || Number(endpoint.workers?.max ?? Number.NaN) !== 1
      || !endpointName.startsWith('itmounts-mass-distilled-')) throw error
    const drained = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
      method: 'PATCH',
      body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
    })
    if (!drained?.id || Number(drained.workers?.max ?? Number.NaN) !== 0) {
      throw new Error('mass_distilled_evaluation_quota_self_drain_rejected')
    }
    activated = await activate()
  }
  if (!activated?.id
    || Number(activated.workers?.min ?? Number.NaN) !== 1
    || Number(activated.workers?.max ?? Number.NaN) !== 1) {
    throw new Error('mass_distilled_evaluation_worker_activation_rejected')
  }
  const pools = (activated.gpu?.pools || []).map(pool => clean(pool, 80))
  if (pools.length !== APPROVED_POOLS.length || !APPROVED_POOLS.every(pool => pools.includes(pool))) {
    throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
  }
  return Object.freeze({
    endpointId: String(activated.id),
    workersMin: 1 as const,
    workersMax: 1 as const,
    idleTimeout: Number(activated.workers?.idleTimeout),
    gpuPools: Object.freeze([...pools]),
    authorityExpanded: false as const,
  })
}

/** Retire a terminal evaluator's worker reservation immediately. The exact endpoint remains materialized
 * for audit/rollback identity and restoreRetiredEndpointCapacity can re-arm max=1 later when an authorized
 * rollback/residency path actually needs it. This releases quota without deleting evidence or widening authority. */
export async function deactivateMassDistilledEvaluationWorker(endpointId: string) {
  const endpoint = await resolveEndpointControlPlane(clean(endpointId, 160))
  const pools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
  if (pools.length !== APPROVED_POOLS.length || !APPROVED_POOLS.every(pool => pools.includes(pool))) {
    throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
  }
  const deactivated = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
  })
  if (!deactivated?.id
    || Number(deactivated.workers?.min ?? Number.NaN) !== 0
    || Number(deactivated.workers?.max ?? Number.NaN) !== 0) {
    throw new Error('mass_distilled_evaluation_worker_retirement_rejected')
  }
  assertNonGpuEndpointSafetyPolicy(deactivated, IDLE_TIMEOUT_SECONDS)
  return Object.freeze({
    endpointId: String(deactivated.id),
    workersMin: 0 as const,
    workersMax: 0 as const,
    idleTimeout: Number(deactivated.workers?.idleTimeout),
    authorityExpanded: false as const,
  })
}

function materializedEndpointMatches(endpoint: Endpoint, input: MassDistilledRuntimeArtifact, modelName: string) {
  const args = clean(endpoint.args, 20_000)
  const ports = endpoint.ports || []
  const env = endpoint.env || {}
  const lane = input.attentionArchitecture === 'exclusive_self_attention_v1' ? 'xsa' : 'standard'
  const expectedImage = exactArtifactContainerImageFromEnv(lane) || VLLM_IMAGE
  const immutableImage = exactArtifactContainerImageFromEnv(lane)
  const runtimeMarker = input.attentionArchitecture === 'exclusive_self_attention_v1' ? 'xsa_gateway.py' : 'mass_gateway.py'
  const identityInArgs = args.includes(BASE_MODEL_REVISION)
    && args.includes(input.artifactRevision)
    && args.includes(input.artifactId)
    && args.includes(modelName)
  const identityInEnv = clean(env.ITMOUNTS_BASE_MODEL_REVISION, 80) === BASE_MODEL_REVISION
    && clean(env.ITMOUNTS_ADAPTER_MODEL_REVISION, 80) === input.artifactRevision
    && clean(env.ITMOUNTS_ADAPTER_MODEL_ID, 500) === input.artifactId
    && clean(env.ITMOUNTS_DISTILLED_MODEL_NAME, 240) === modelName
    && (lane !== 'standard' || clean(env.ITMOUNTS_STANDARD_GATEWAY_REVISION, 80) === 'baseline-and-exact-v2')
  return endpoint.image === expectedImage
    && (immutableImage ? identityInEnv : identityInArgs)
    && args.includes(runtimeMarker)
    && ports.includes(`${PUBLIC_PORT}/http`)
    && clean(env.HF_HOME, 200) === '/models/hf-cache'
    && clean(env.PORT, 40) === String(PUBLIC_PORT)
    && clean(env.PORT_HEALTH, 40) === String(PUBLIC_PORT)
    && clean(env.HEALTH_CHECK_PATH, 80) === '/ping'
}

function assertMaterializedEndpointIdentity(
  endpoint: Endpoint,
  input: MassDistilledRuntimeArtifact,
  modelName: string,
  idleTimeoutSeconds = runtimeIdleTimeoutSeconds(input),
  approvedPools: readonly string[] = APPROVED_POOLS,
) {
  assertEndpointSafetyPolicy(endpoint, idleTimeoutSeconds, approvedPools)
  if (!materializedEndpointMatches(endpoint, input, modelName)) {
    throw new Error('mass_distilled_runtime_materialized_identity_mismatch')
  }
}

function nativeV2EndpointConfig(
  input: MassDistilledRuntimeArtifact,
  modelName: string,
  approvedPools: readonly string[],
  idleTimeoutSeconds: number,
) {
  return Object.freeze({
    ...(input.attentionArchitecture === 'exclusive_self_attention_v1'
      ? xsaRuntimeInlineContainer(input, modelName)
      : massDistilledRuntimeInlineContainer(input, modelName)),
    type: ROUTING,
    gpu: { pools: [...approvedPools], count: 1 },
    workers: { min: 0, max: 1, idleTimeout: idleTimeoutSeconds },
    scaling: { type: 'REQUEST_COUNT' as const, requestCount: 1 },
    timeout: 300000,
    flashboot: 'FLASHBOOT' as const,
  })
}

async function resolveExactEndpoint(
  input: MassDistilledRuntimeArtifact,
  recoveryFrom = '',
  approvedPools: readonly string[] = APPROVED_POOLS,
  allowCreate = true,
) {
  const ids = identity(input)
  const idleTimeoutSeconds = runtimeIdleTimeoutSeconds(input)
  const listed = await requestV2<{ endpoints?: Endpoint[] }>('/serverless')
  let endpoint = (listed.endpoints || []).find(item => clean(item.name, 240) === ids.endpointName)
  let createdEndpoint = false

  if (!endpoint) {
    if (!allowCreate) throw new Error('mass_distilled_runtime_existing_endpoint_missing')
    // Preserve one account-wide worker slot before creating a new exact endpoint. This prevents
    // Residency from using the final reservation and turns quota cleanup into a preflight rather
    // than waiting for RunPod to reject POST /serverless first.
    const configuredQuota = Number(process.env.RUNPOD_SERVERLESS_WORKER_QUOTA || '10')
    const workerQuota = Number.isFinite(configuredQuota) && configuredQuota >= 1 ? Math.floor(configuredQuota) : 10
    const reservedWorkers = (listed.endpoints || []).reduce((total, item) =>
      total + Math.max(0, Math.floor(Number(item.workers?.max ?? 0))), 0)
    if (workerQuota - reservedWorkers <= 1) await releaseOtherMassEndpointCapacity('')
    const config = nativeV2EndpointConfig(input, ids.modelName, approvedPools, idleTimeoutSeconds)
    endpoint = await withWorkerQuotaRecovery('', () => requestV2<Endpoint>('/serverless', {
      method: 'POST',
      body: JSON.stringify({ name: ids.endpointName, ...config }),
    }))
    if (!endpoint?.id) throw new Error(`mass_distilled_runtime_endpoint_id_missing:recovery_from=${clean(recoveryFrom, 100)}`)
    createdEndpoint = true
  } else {
    assertNonGpuEndpointSafetyPolicy(endpoint, idleTimeoutSeconds)
    const existingPools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80))
    const poolsAlreadyExact = existingPools.length === approvedPools.length
      && approvedPools.every(pool => existingPools.includes(pool))
    // Never PATCH image/args/env/ports onto an existing exact endpoint. RunPod's v2 control plane
    // rejects that full container mutation (Production HTTP 422), and mutating a proved endpoint would
    // also make old canary evidence ambiguous. Container drift requires a new named generation.
    if (!materializedEndpointMatches(endpoint, input, ids.modelName)) {
      throw new Error('mass_distilled_runtime_endpoint_generation_drift')
    }
    // GPU policy is independently mutable and constrained below; do not mix it with container identity.
    if (!poolsAlreadyExact && !approvedPools.some(pool => existingPools.includes(pool))) {
      throw new Error('mass_distilled_runtime_approved_gpu_pool_unavailable')
    }
  }

  endpoint = await restoreRetiredEndpointCapacity(
    await constrainEndpointToApprovedGpu(String(endpoint.id), ids.endpointName, idleTimeoutSeconds, approvedPools),
    idleTimeoutSeconds,
    approvedPools,
  )
  assertMaterializedEndpointIdentity(endpoint, input, ids.modelName, idleTimeoutSeconds, approvedPools)
  return Object.freeze({ endpoint, ...ids, createdEndpoint, reboundTemplate: false, nativeV2Inline: true as const })
}

/**
 * Preserve the proven creator first. Compatibility recovery handles provider response/identity drift,
 * but only after the exact approval-scoped endpoint passes the non-template safety policy.
 */
async function provisionMassDistilledRuntimeWithPools(
  input: MassDistilledRuntimeArtifact,
  approvedPools: readonly string[],
) {
  const idleTimeoutSeconds = runtimeIdleTimeoutSeconds(input)
  const recovered = await resolveExactEndpoint(input, 'native_v2_inline', approvedPools)
  const endpoint = recovered.endpoint
  return Object.freeze({
    templateName: recovered.templateName,
    endpointName: recovered.endpointName,
    modelName: recovered.modelName,
    endpointId: String(endpoint.id),
    createdTemplate: false,
    createdEndpoint: recovered.createdEndpoint,
    reboundTemplate: false,
    nativeV2Inline: true as const,
    workersMin: Number(endpoint.workers?.min),
    workersMax: Number(endpoint.workers?.max),
    idleTimeout: Number(endpoint.workers?.idleTimeout),
    gpuPools: Object.freeze([...(endpoint.gpu?.pools || [])]),
    baseUrl: `https://${endpoint.id}.api.runpod.ai/v1`,
  })
}

export async function provisionMassDistilledRuntime(input: MassDistilledRuntimeArtifact) {
  return provisionMassDistilledRuntimeWithPools(input, APPROVED_POOLS)
}

/** Short canary only: prefer 24 GB but permit 16 GB fallback for worker availability. */
export async function provisionMassDistilledCanaryRuntime(input: MassDistilledRuntimeArtifact) {
  let catalogGpus: CatalogGpu[] | null = null
  try {
    const catalog = await requestV2<{ gpus?: CatalogGpu[] }>('/catalog/gpus')
    catalogGpus = Array.isArray(catalog?.gpus) ? catalog.gpus : null
  } catch {
    catalogGpus = null
  }
  const pools = selectMassDistilledCanaryPools(catalogGpus)
  if (!pools.length) throw new Error('mass_distilled_runtime_gpu_capacity_unavailable')
  const catalogServerlessPriceUsdPerHourByPool = massDistilledCanaryCatalogPriceSnapshot(catalogGpus, pools)
  const provisioned = await provisionMassDistilledRuntimeWithPools(input, pools)
  return Object.freeze({
    ...provisioned,
    canaryEligibleGpuPools: Object.freeze([...pools]),
    canaryCatalogObserved: Array.isArray(catalogGpus),
    canaryCatalogServerlessPriceUsdPerHourByPool: catalogServerlessPriceUsdPerHourByPool,
    actualWorkerGpuPoolObserved: false as const,
  })
}

function canaryEndpointPools(endpoint: Endpoint): string[] {
  const pools = (endpoint.gpu?.pools || []).map(pool => clean(pool, 80)).filter(Boolean)
  if (!pools.length || pools.some(pool => !CANARY_APPROVED_POOLS.includes(pool as typeof CANARY_APPROVED_POOLS[number]))) {
    throw new Error('mass_distilled_runtime_canary_gpu_pool_drift')
  }
  return pools
}

function assertActiveCanaryWorkerPolicy(endpoint: Endpoint, approvedPools: readonly string[]) {
  if (endpoint.type !== ROUTING) throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if (Number(endpoint.workers?.min ?? Number.NaN) !== 1
    || Number(endpoint.workers?.max ?? Number.NaN) !== 1
    || Number(endpoint.workers?.idleTimeout ?? Number.NaN) > IDLE_TIMEOUT_SECONDS) {
    throw new Error('mass_distilled_runtime_active_canary_worker_policy_drift')
  }
  if (Number(endpoint.gpu?.count ?? Number.NaN) !== 1) throw new Error('mass_distilled_runtime_endpoint_gpu_count_drift')
  const pools = canaryEndpointPools(endpoint)
  if (pools.length !== approvedPools.length || !approvedPools.every(pool => pools.includes(pool))) {
    throw new Error('mass_distilled_runtime_canary_gpu_pool_drift')
  }
}

/**
 * A paid canary is already durably reserved before this function is called. Explicitly setting min=1
 * asks RunPod to allocate the already-authorized single worker immediately instead of relying on the
 * request-count scaler to notice a cold /ping request. The max worker count and GPU pools never widen.
 */
export async function activateMassDistilledCanaryWorker(endpointId: string) {
  const endpoint = await resolveEndpointControlPlane(clean(endpointId, 160))
  assertNonGpuEndpointSafetyPolicy(endpoint, IDLE_TIMEOUT_SECONDS)
  const pools = canaryEndpointPools(endpoint)
  let activated: Endpoint | null = null
  try {
    const activate = () => requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
      method: 'PATCH',
      body: JSON.stringify({ workers: { min: 1, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
    })
    try {
      activated = await withWorkerQuotaRecovery(String(endpoint.id), activate)
    } catch (error) {
      // Production 2026-09-25: every disposable sibling could already be protected while RunPod's
      // account-wide max-worker quota remained exactly full. RunPod then rejected this endpoint's
      // min=1/max=1 warm-start even though max was already 1. Temporarily release THIS exact
      // canary's own max-1 reservation, then restore the same min=1/max=1 envelope. This creates no
      // endpoint, touches no protected sibling, and never raises the account's prior worker ceiling.
      const endpointName = clean(endpoint.name, 240)
      const originalMaxWorkers = Math.max(0, Math.min(1, Math.floor(Number(endpoint.workers?.max ?? 0))))
      if (!runpodWorkerQuotaError(error)
        || originalMaxWorkers !== 1
        || !endpointName.startsWith('itmounts-mass-distilled-')) throw error
      const drained = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
        method: 'PATCH',
        body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
      })
      if (!drained?.id || Number(drained.workers?.max ?? Number.NaN) !== 0) {
        throw new Error('mass_distilled_runtime_quota_self_drain_rejected')
      }
      activated = await activate()
    }
    if (!activated?.id) throw new Error('mass_distilled_runtime_canary_worker_activation_missing')
    assertActiveCanaryWorkerPolicy(activated, pools)
    return Object.freeze({
      endpointId: String(activated.id),
      workersMin: Number(activated.workers?.min),
      workersMax: Number(activated.workers?.max),
      idleTimeout: Number(activated.workers?.idleTimeout),
      gpuPools: Object.freeze([...pools]),
    })
  } catch (error) {
    // If RunPod accepted the warm-start patch but a later validation failed, immediately attempt to
    // restore scale-to-zero before surfacing the error. Cleanup failure is intentionally not hidden by
    // returning success; the original activation error remains the canary failure.
    if (activated?.id) {
      await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(activated.id))}`, {
        method: 'PATCH',
        body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
      }).catch(() => undefined)
    }
    throw error
  }
}

/** Retire a terminal canary's worker reservation immediately. The exact endpoint remains materialized
 * for canary evidence, later evaluation identity and rollback; restoreRetiredEndpointCapacity re-arms max=1
 * when an authorized evaluator or rollback path actually needs it. */
export async function deactivateMassDistilledCanaryWorker(endpointId: string) {
  const endpoint = await resolveEndpointControlPlane(clean(endpointId, 160))
  const pools = canaryEndpointPools(endpoint)
  const deactivated = await requestV2<Endpoint>(`/serverless/${encodeURIComponent(String(endpoint.id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ workers: { min: 0, max: 0, idleTimeout: IDLE_TIMEOUT_SECONDS } }),
  })
  if (!deactivated?.id
    || Number(deactivated.workers?.min ?? Number.NaN) !== 0
    || Number(deactivated.workers?.max ?? Number.NaN) !== 0) {
    throw new Error('mass_distilled_runtime_canary_worker_retirement_rejected')
  }
  assertNonGpuEndpointSafetyPolicy(deactivated, IDLE_TIMEOUT_SECONDS)
  return Object.freeze({
    endpointId: String(deactivated.id),
    workersMin: 0 as const,
    workersMax: 0 as const,
    idleTimeout: Number(deactivated.workers?.idleTimeout),
    gpuPools: Object.freeze([...pools]),
    authorityExpanded: false as const,
  })
}

/**
 * Self-Healing control-plane reconciliation for an already-created exact-artifact runtime.
 *
 * This function never creates a template or endpoint and never sends a model request. It may only
 * restore the existing endpoint's approved GPU pool, exact template binding, scale-to-zero/max-1
 * worker envelope, and idle timeout. Missing exact provider resources fail closed so a separate
 * authority decision is required before creation.
 */
export async function reconcileExistingMassDistilledRuntime(input: MassDistilledRuntimeArtifact) {
  const candidateId = clean(input.candidateId, 300)
  const artifactId = clean(input.artifactId, 500)
  const artifactRevision = clean(input.artifactRevision, 40).toLowerCase()
  const artifactHash = clean(input.artifactHash, 64).toLowerCase()
  if (
    !candidateId.startsWith('mass:')
    || !artifactId
    || !/^[a-f0-9]{40}$/.test(artifactRevision)
    || !/^[a-f0-9]{64}$/.test(artifactHash)
  ) {
    throw new Error('mass_distilled_runtime_artifact_invalid')
  }

  const idleTimeoutSeconds = runtimeIdleTimeoutSeconds(input)
  const recovered = await resolveExactEndpoint({
    ...input,
    candidateId,
    artifactId,
    artifactRevision,
    artifactHash,
  }, 'self_healing_existing_only', APPROVED_POOLS, false)
  const endpoint = await restoreRetiredEndpointCapacity(recovered.endpoint, idleTimeoutSeconds)
  assertMaterializedEndpointIdentity(endpoint, {
    ...input,
    candidateId,
    artifactId,
    artifactRevision,
    artifactHash,
  }, recovered.modelName, idleTimeoutSeconds)

  return Object.freeze({
    templateName: recovered.templateName,
    endpointName: recovered.endpointName,
    modelName: recovered.modelName,
    endpointId: String(endpoint.id),
    createdTemplate: false as const,
    createdEndpoint: false as const,
    reboundTemplate: recovered.reboundTemplate,
    workersMin: Number(endpoint.workers?.min),
    workersMax: Number(endpoint.workers?.max),
    idleTimeout: Number(endpoint.workers?.idleTimeout),
    baseUrl: `https://${endpoint.id}.api.runpod.ai/v1`,
    computeWakeAuthorized: false as const,
    modelInvocationAuthorized: false as const,
    productionTrafficAuthorized: false as const,
    authorityExpanded: false as const,
  })
}
