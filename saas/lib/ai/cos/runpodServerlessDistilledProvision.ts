// saas/lib/ai/cos/runpodServerlessDistilledProvision.ts
// saas/lib/ai/cos/runpodServerlessDistilledProvision.ts
import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const GRAPHQL_API = 'https://api.runpod.io/graphql'
const SERVERLESS_API = 'https://api.runpod.ai/v2'
// Keep each materially different load-balancer bootstrap immutable. A new endpoint identity makes
// failed canary evidence auditable instead of silently changing the worker behind an old receipt.
export const DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v5'
export const DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v7'
export const DISTILLED_ENDPOINT_ROUTING = 'LOAD_BALANCER' as const
export const DISTILLED_CONTAINER_PORT = 8000
const DISTILLED_INTERNAL_VLLM_PORT = 8001
export const DISTILLED_MODEL_NAME = 'itmounts-distilled-reasoning-v1'
export const DISTILLED_BASE_MODEL_ID = 'Qwen/Qwen3-4B'
export const DISTILLED_BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
export const DISTILLED_BASE_MODEL_REFERENCE = `https://huggingface.co/${DISTILLED_BASE_MODEL_ID}:${DISTILLED_BASE_MODEL_REVISION}`
export const DISTILLED_ADAPTER_MODEL_ID = 'cadomos/itmounts-student-f993a365a01e'
export const DISTILLED_ADAPTER_MODEL_REVISION = '9f03387d87de550b96d973f9f30a3f02e783997e'
export const DISTILLED_IDLE_TIMEOUT_SECONDS = 60
export const DISTILLED_STARTUP_READY_TIMEOUT_MS = 220_000
export const DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS = 60_000
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const REQUEST_TIMEOUT_MS = 15_000
// The standard 24 GB Serverless tier is $0.69/hr. A bounded 220s startup-ready window, 60s
// inference call, and 60s warm window total 340s, or ~$0.065 at $0.69/hr. This remains below the
// existing $0.20 owner canary ceiling without keeping a worker unnecessarily warm.
const MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0.69
export const DISTILLED_WORST_CASE_CANARY_COST_USD = (
  (DISTILLED_IDLE_TIMEOUT_SECONDS
    + (DISTILLED_STARTUP_READY_TIMEOUT_MS / 1000)
    + (DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS / 1000))
  * MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD
) / 3600

const APPROVED_SERVERLESS_GPU_POOLS = [
  'AMPERE_16',
  'AMPERE_24',
] as const

const PREFERRED_GPU_TYPE_IDS = [
  'NVIDIA RTX A4000',
  'NVIDIA RTX A4500',
  'NVIDIA RTX 4000 Ada Generation',
  'NVIDIA RTX A5000',
  'NVIDIA GeForce RTX 3090',
  'NVIDIA L4',
] as const

type RunpodTemplateV1 = {
  id: string
  name: string
  imageName?: string
  isServerless?: boolean
  dockerEntrypoint?: string[]
  dockerStartCmd?: string[]
  ports?: string[]
}
type RunpodEndpointV2 = {
  id: string
  name: string
  type?: 'QUEUE' | 'LOAD_BALANCER'
  templateId?: string
  workers?: { min?: number; max?: number; idleTimeout?: number }
  scaling?: { type?: string; requestCount?: number; queueDelay?: number }
  timeout?: number
  flashboot?: string
  gpu?: { pools?: string[]; count?: number }
}
type RunpodEndpointGraphQl = {
  id?: string
  name?: string
  type?: 'QB' | 'LB'
  templateId?: string
  modelReferences?: string[]
}
type RunpodGpuCatalogItemV2 = {
  id?: string
  name?: string
  pool?: string
  manufacturer?: string
  memory?: number
  availability?: string
  price?: { serverless?: number | null }
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

function finitePrice(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
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
      Array.isArray(value.errors) ? value.errors.join('; ') : null,
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

async function requestV1<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${REST_V1}${path}`, {
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
      const method = String(init.method || 'GET').toUpperCase()
      throw new Error(`RunPod REST v1 ${method} ${path} HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
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
      const method = String(init.method || 'GET').toUpperCase()
      throw new Error(`RunPod REST v2 ${method} ${path} HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return raw ? JSON.parse(raw) as T : {} as T
  } finally {
    clearTimeout(timer)
  }
}

async function requestGraphQl<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${GRAPHQL_API}?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; SignalBoost/1.0)',
      },
      body: JSON.stringify({ query, variables }),
    })
    const raw = await response.text()
    if (!response.ok) {
      const detail = safeRunpodErrorDetail(raw)
      throw new Error(`RunPod GraphQL HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    let payload: { data?: T; errors?: Array<{ message?: unknown }> }
    try {
      payload = raw ? JSON.parse(raw) as typeof payload : {}
    } catch {
      throw new Error('RunPod GraphQL response was not valid JSON')
    }
    if (payload.errors?.length) {
      const detail = safeRunpodErrorDetail(JSON.stringify({ message: payload.errors[0]?.message }))
        || 'unknown GraphQL error'
      throw new Error(`RunPod GraphQL error: ${detail}`)
    }
    if (!payload.data) throw new Error('RunPod GraphQL response carried no data')
    return payload.data
  } finally {
    clearTimeout(timer)
  }
}

function hfToken(): string {
  const token = process.env.HF_TOKEN?.trim() || ''
  if (token.length < 20) throw new Error('HF_TOKEN is not configured for private distilled adapter access')
  return token
}

/**
 * The public RunPod load balancer only sees port 8000. Start that tiny gateway immediately, then
 * initialize the exact vLLM artifact behind it on localhost:8001. This converts a long cold start
 * from "no worker available" into an accepted request waiting inside the already-routable worker.
 * If RunPod's documented cached-model mount contains the exact base revision, use it directly;
 * otherwise fall back to the exact Hugging Face revision while preserving artifact identity.
 */
function startupGatewaySource(): string {
  return String.raw`import asyncio
import json
import os
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from huggingface_hub import snapshot_download

BASE_ID = os.environ["ITMOUNTS_BASE_MODEL_ID"]
BASE_REV = os.environ["ITMOUNTS_BASE_MODEL_REVISION"]
ADAPTER_ID = os.environ["ITMOUNTS_ADAPTER_MODEL_ID"]
ADAPTER_REV = os.environ["ITMOUNTS_ADAPTER_MODEL_REVISION"]
DISTILLED_MODEL = os.environ["ITMOUNTS_DISTILLED_MODEL_NAME"]
HF_TOKEN = os.environ["HF_TOKEN"]
INTERNAL_PORT = int(os.environ.get("ITMOUNTS_INTERNAL_VLLM_PORT", "8001"))
PUBLIC_PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(title="iTMounts Distilled Startup Gateway", version="1.0")
model_ready = asyncio.Event()
bootstrap_error = None
vllm_process = None


def exact_cached_base_path():
    if "/" not in BASE_ID:
        return None
    org, name = BASE_ID.split("/", 1)
    path = Path("/runpod-volume/huggingface-cache/hub") / f"models--{org}--{name}" / "snapshots" / BASE_REV
    return str(path) if path.is_dir() else None


async def bootstrap():
    global bootstrap_error, vllm_process
    try:
        base_path = exact_cached_base_path()
        if not base_path:
            base_path = await asyncio.to_thread(
                snapshot_download,
                repo_id=BASE_ID,
                revision=BASE_REV,
                local_dir="/models/base",
                token=HF_TOKEN,
            )
        adapter_path = await asyncio.to_thread(
            snapshot_download,
            repo_id=ADAPTER_ID,
            revision=ADAPTER_REV,
            local_dir="/models/adapter",
            token=HF_TOKEN,
        )
        lora = json.dumps({
            "name": DISTILLED_MODEL,
            "path": adapter_path,
            "base_model_name": BASE_ID,
        })
        vllm_process = await asyncio.create_subprocess_exec(
            "vllm", "serve", base_path,
            "--host", "127.0.0.1",
            "--port", str(INTERNAL_PORT),
            "--served-model-name", BASE_ID,
            "--enable-lora",
            "--max-lora-rank", "16",
            "--max-loras", "1",
            "--max-cpu-loras", "1",
            "--lora-modules", lora,
            "--gpu-memory-utilization", "0.85",
            "--max-model-len", "8192",
            "--dtype", "auto",
            "--enforce-eager",
        )
        async with httpx.AsyncClient(timeout=2.0) as client:
            for _ in range(300):
                if vllm_process.returncode is not None:
                    raise RuntimeError(f"vllm_exited_{vllm_process.returncode}")
                try:
                    response = await client.get(f"http://127.0.0.1:{INTERNAL_PORT}/health")
                    if response.status_code == 200:
                        model_ready.set()
                        return
                except Exception:
                    pass
                await asyncio.sleep(1)
        raise TimeoutError("vllm_model_startup_timeout")
    except Exception as exc:
        bootstrap_error = f"{type(exc).__name__}:{str(exc)[:240]}"


@app.on_event("startup")
async def start_background_model():
    asyncio.create_task(bootstrap())


@app.get("/ping")
async def ping():
    return {"status": "accepting_requests", "modelReady": model_ready.is_set()}


@app.get("/ready")
async def ready():
    if bootstrap_error:
        raise HTTPException(status_code=503, detail=f"distilled_bootstrap_failed:{bootstrap_error}")
    if not model_ready.is_set():
        return Response(status_code=204)
    return {"ready": True, "model": DISTILLED_MODEL}


async def wait_for_model():
    deadline = asyncio.get_running_loop().time() + 300
    while not model_ready.is_set():
        if bootstrap_error:
            raise HTTPException(status_code=503, detail=f"distilled_bootstrap_failed:{bootstrap_error}")
        if asyncio.get_running_loop().time() >= deadline:
            raise HTTPException(status_code=503, detail="distilled_model_not_ready")
        await asyncio.sleep(0.5)


async def proxy_to_vllm(request: Request, path: str):
    await wait_for_model()
    body = await request.body()
    # A buffered proxy defeats streaming: it collects the whole generation before answering, so the
    # connection stays silent for minutes and the RunPod load balancer returns 502. Relay vLLM's
    # bytes as they arrive. read=None lets a long generation run; connect stays bounded.
    timeout = httpx.Timeout(connect=30.0, read=None, write=60.0, pool=30.0)
    client = httpx.AsyncClient(timeout=timeout)
    upstream = client.build_request(
        request.method,
        f"http://127.0.0.1:{INTERNAL_PORT}{path}",
        content=body,
        headers={"content-type": request.headers.get("content-type", "application/json")},
    )
    try:
        response = await client.send(upstream, stream=True)
    except Exception:
        await client.aclose()
        raise

    async def relay():
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        relay(),
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json"),
    )


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    return await proxy_to_vllm(request, "/v1/chat/completions")


@app.post("/v1/completions")
async def completions(request: Request):
    return await proxy_to_vllm(request, "/v1/completions")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PUBLIC_PORT)
`
}

function startupCommand(): string {
  const gateway = Buffer.from(startupGatewaySource(), 'utf8').toString('base64')
  return [
    'set -euo pipefail',
    'mkdir -p /models/base /models/adapter /models/hf-cache',
    `export ITMOUNTS_BASE_MODEL_ID='${DISTILLED_BASE_MODEL_ID}'`,
    `export ITMOUNTS_BASE_MODEL_REVISION='${DISTILLED_BASE_MODEL_REVISION}'`,
    `export ITMOUNTS_ADAPTER_MODEL_ID='${DISTILLED_ADAPTER_MODEL_ID}'`,
    `export ITMOUNTS_ADAPTER_MODEL_REVISION='${DISTILLED_ADAPTER_MODEL_REVISION}'`,
    `export ITMOUNTS_DISTILLED_MODEL_NAME='${DISTILLED_MODEL_NAME}'`,
    `export ITMOUNTS_INTERNAL_VLLM_PORT='${DISTILLED_INTERNAL_VLLM_PORT}'`,
    `python3 -c "import base64; open('/tmp/itmounts_distilled_gateway.py','wb').write(base64.b64decode('${gateway}'))"`,
    'exec python3 /tmp/itmounts_distilled_gateway.py',
  ].join('; ')
}

function templateHasExactBootstrap(template: RunpodTemplateV1): boolean {
  const command = (template.dockerStartCmd || []).join(' ')
  const entrypoint = (template.dockerEntrypoint || []).join(' ')
  return template.imageName === VLLM_IMAGE
    && entrypoint.includes('bash')
    && command.includes(DISTILLED_BASE_MODEL_REVISION)
    && command.includes(DISTILLED_ADAPTER_MODEL_REVISION)
    && command.includes('itmounts_distilled_gateway.py')
    && (template.ports || []).includes(`${DISTILLED_CONTAINER_PORT}/http`)
}

export function runpodServerlessRootUrl(endpointId: string): string {
  const id = endpointId.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  return `https://${id}.api.runpod.ai`
}

export function runpodServerlessOpenAiBaseUrl(endpointId: string): string {
  return `${runpodServerlessRootUrl(endpointId)}/v1`
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

function endpointGraphQlPolicyPayload() {
  return {
    workersMin: 0,
    workersMax: 1,
    idleTimeout: DISTILLED_IDLE_TIMEOUT_SECONDS,
    scalerType: 'REQUEST_COUNT',
    scalerValue: 1,
    executionTimeoutMs: 300_000,
    flashBootType: 'FLASHBOOT',
  }
}

function assertExactCachedBaseModel(endpoint: RunpodEndpointGraphQl, expectedId: string): void {
  if (clean(endpoint.id, 120) !== expectedId) {
    throw new Error('RunPod distilled endpoint cache evidence returned the wrong endpoint')
  }
  if (endpoint.type !== 'LB') {
    throw new Error('RunPod distilled endpoint GraphQL routing no longer matches load-balancer policy')
  }
  const references = Array.isArray(endpoint.modelReferences)
    ? endpoint.modelReferences.map(reference => clean(reference, 500))
    : []
  if (references.length !== 1 || references[0] !== DISTILLED_BASE_MODEL_REFERENCE) {
    throw new Error('RunPod distilled endpoint does not carry the exact cached base-model revision')
  }
}

async function createDistilledLoadBalancerEndpoint(input: {
  templateId: string
  pools: readonly string[]
}): Promise<RunpodEndpointGraphQl> {
  // RunPod's GraphQL EndpointInput is the control-plane surface that can set both the immutable LB
  // routing type and modelReferences in one write. The cached base download completes outside the
  // worker lifecycle, so the paid cold start only loads weights instead of downloading them.
  const data = await requestGraphQl<{ saveEndpoint?: RunpodEndpointGraphQl }>(`
    mutation SaveDistilledEndpoint($input: EndpointInput!) {
      saveEndpoint(input: $input) {
        id
        name
        type
        templateId
        modelReferences
      }
    }
  `, {
    input: {
      name: DISTILLED_ENDPOINT_NAME,
      type: 'LB',
      templateId: input.templateId,
      gpuIds: input.pools.join(','),
      gpuCount: 1,
      ...endpointGraphQlPolicyPayload(),
      modelReferences: [DISTILLED_BASE_MODEL_REFERENCE],
    },
  })
  const endpoint = data.saveEndpoint
  const endpointId = clean(endpoint?.id, 120)
  if (!endpoint || !endpointId) throw new Error('RunPod distilled endpoint creation returned no endpoint')
  assertExactCachedBaseModel(endpoint, endpointId)
  return endpoint
}

async function assertDistilledEndpointCachedBaseModel(endpointId: string): Promise<void> {
  const data = await requestGraphQl<{
    myself?: { endpoint?: RunpodEndpointGraphQl | null }
  }>(`
    query DistilledEndpointCachedModel($id: String!) {
      myself {
        endpoint(id: $id) {
          id
          type
          modelReferences
        }
      }
    }
  `, { id: endpointId })
  const endpoint = data.myself?.endpoint
  if (!endpoint) throw new Error('RunPod distilled endpoint cache evidence is unavailable')
  assertExactCachedBaseModel(endpoint, endpointId)
}

function serverlessGpuCandidates(items: readonly RunpodGpuCatalogItemV2[]) {
  return items
    .filter(item => clean(item.manufacturer, 40).toUpperCase() === 'NVIDIA')
    .filter(item => Number(item.memory || 0) >= 16 && Number(item.memory || 0) <= 24)
    .map(item => ({
      id: clean(item.id, 160),
      pool: clean(item.pool, 80),
      price: finitePrice(item.price?.serverless),
      availability: clean(item.availability, 40).toUpperCase(),
    }))
    .filter(item => APPROVED_SERVERLESS_GPU_POOLS.includes(item.pool as typeof APPROVED_SERVERLESS_GPU_POOLS[number]))
    .filter(item => item.id && item.pool && item.price !== null && item.price <= MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD)
    .filter(item => item.availability !== 'NONE')
}

async function approvedServerlessGpuSelection(): Promise<{ pools: string[]; gpuTypeIds: string[] }> {
  const catalog = await requestV2<{ gpus?: RunpodGpuCatalogItemV2[] }>('/catalog/gpus')
  const candidates = serverlessGpuCandidates(catalog.gpus || [])
  const preferred = candidates.filter(item => PREFERRED_GPU_TYPE_IDS.includes(item.id as typeof PREFERRED_GPU_TYPE_IDS[number]))
  const fallback = candidates.filter(item => !preferred.some(pref => pref.pool === item.pool))
    .sort((a, b) => (a.price || Infinity) - (b.price || Infinity))
  const selected = [...preferred, ...fallback]
  const pools: string[] = []
  const gpuTypeIds: string[] = []
  for (const item of selected) {
    if (!pools.includes(item.pool)) pools.push(item.pool)
    if (!gpuTypeIds.includes(item.id)) gpuTypeIds.push(item.id)
    if (pools.length >= APPROVED_SERVERLESS_GPU_POOLS.length) break
  }
  if (pools.length < APPROVED_SERVERLESS_GPU_POOLS.length) {
    throw new Error('RunPod catalog does not currently expose both approved 16 GB and 24 GB Serverless pools within the canary price ceiling')
  }
  return { pools, gpuTypeIds }
}

function assertDistilledEndpointPolicy(endpoint: RunpodEndpointV2, expectedId: string): {
  endpointId: string
  workersMin: number
  workersMax: number
  idleTimeout: number
} {
  if (endpoint.type && endpoint.type !== DISTILLED_ENDPOINT_ROUTING) {
    throw new Error('RunPod distilled endpoint routing no longer matches load-balancer policy')
  }
  const workersMin = Number(endpoint.workers?.min ?? Number.NaN)
  const workersMax = Number(endpoint.workers?.max ?? Number.NaN)
  const idleTimeout = Number(endpoint.workers?.idleTimeout ?? Number.NaN)
  if (workersMin !== 0) throw new Error('RunPod distilled endpoint is not scale-to-zero')
  if (!Number.isFinite(workersMax) || workersMax > 1) throw new Error('RunPod distilled endpoint exceeds the approved one-worker ceiling')
  if (!Number.isFinite(idleTimeout) || idleTimeout > DISTILLED_IDLE_TIMEOUT_SECONDS) {
    throw new Error('RunPod distilled endpoint exceeds the approved warm-window ceiling')
  }
  if (endpoint.scaling?.type && endpoint.scaling.type !== 'REQUEST_COUNT') {
    throw new Error('RunPod distilled endpoint scaler no longer matches request-count policy')
  }
  if (Number(endpoint.scaling?.requestCount ?? 1) > 1) {
    throw new Error('RunPod distilled endpoint exceeds the approved request-count scaler threshold')
  }
  if (Number(endpoint.timeout ?? 300_000) > 300_000) {
    throw new Error('RunPod distilled endpoint exceeds the approved request timeout ceiling')
  }
  if (endpoint.gpu?.count !== undefined && Number(endpoint.gpu.count) !== 1) {
    throw new Error('RunPod distilled endpoint no longer uses exactly one GPU per worker')
  }
  return { endpointId: endpoint.id || expectedId, workersMin, workersMax, idleTimeout }
}

export async function reconcileRunpodServerlessDistilledEndpoint(endpointId: string): Promise<{
  endpointId: string
  workersMin: number
  workersMax: number
  idleTimeout: number
}> {
  const id = endpointId.trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  // Canary execution is an evidence operation, not an endpoint-management operation. Re-read the
  // endpoint and fail closed on policy drift instead of PATCHing before every paid canary.
  const listed = await requestV2<{ endpoints?: RunpodEndpointV2[] }>('/serverless')
  const endpoint = (listed.endpoints || []).find(item => item.id === id)
  if (!endpoint) throw new Error('RunPod distilled endpoint is no longer present in the account')
  const policy = assertDistilledEndpointPolicy(endpoint, id)
  await assertDistilledEndpointCachedBaseModel(id)
  return policy
}

export async function provisionRunpodServerlessDistilledLlm(): Promise<{
  createdTemplate: boolean
  createdEndpoint: boolean
  templateId: string
  endpointId: string
  baseUrl: string
  model: string
  baseModelReference: string
  workersMin: number
  workersMax: number
  idleTimeout: number
  gpuTypes: readonly string[]
}> {
  const token = hfToken()
  const templates = await requestV1<RunpodTemplateV1[]>('/templates')
  let template = templates.find(item => item.name === DISTILLED_TEMPLATE_NAME && item.isServerless !== false)
  let createdTemplate = false

  if (template && !templateHasExactBootstrap(template)) {
    throw new Error('RunPod distilled load-balancer template exists but does not match the exact-artifact bootstrap contract')
  }

  if (!template) {
    template = await requestV1<RunpodTemplateV1>('/templates', {
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
          HEALTH_CHECK_PATH: '/ping',
        },
        isPublic: false,
        isServerless: true,
        ports: [`${DISTILLED_CONTAINER_PORT}/http`],
        readme: 'iTMounts exact cached Qwen3-4B revision + immutable LoRA startup-gateway runtime. Scale-to-zero. Evaluation before Production activation.',
      }),
    })
    createdTemplate = true
  }

  if (!template?.id) throw new Error('RunPod distilled template response carried no template id')

  const listed = await requestV2<{ endpoints?: RunpodEndpointV2[] }>('/serverless')
  let endpoint = (listed.endpoints || []).find(item => item.name === DISTILLED_ENDPOINT_NAME)
  let createdEndpoint = false
  let gpuTypeIds: string[] = []

  if (endpoint && endpoint.type && endpoint.type !== DISTILLED_ENDPOINT_ROUTING) {
    throw new Error('RunPod distilled endpoint name is already bound to the wrong routing type')
  }

  if (!endpoint) {
    const gpu = await approvedServerlessGpuSelection()
    gpuTypeIds = gpu.gpuTypeIds
    const created = await createDistilledLoadBalancerEndpoint({
      templateId: template.id,
      pools: gpu.pools,
    })
    endpoint = {
      id: clean(created.id, 120),
      name: clean(created.name, 240) || DISTILLED_ENDPOINT_NAME,
      type: created.type === 'LB' ? DISTILLED_ENDPOINT_ROUTING : undefined,
      templateId: clean(created.templateId, 120) || template.id,
    }
    createdEndpoint = true
  } else {
    gpuTypeIds = (endpoint.gpu?.pools || []).map(pool => `pool:${clean(pool, 80)}`)
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
    baseModelReference: DISTILLED_BASE_MODEL_REFERENCE,
    workersMin: policy.workersMin,
    workersMax: policy.workersMax,
    idleTimeout: policy.idleTimeout,
    gpuTypes: Object.freeze([...gpuTypeIds]),
  }
}

export async function waitForRunpodServerlessDistilledReady(input: {
  endpointId: string
  timeoutMs?: number
  delayMs?: number
}): Promise<{ ok: boolean; httpStatus: number | null; error: string | null }> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const timeoutMs = Math.max(30_000, Math.min(DISTILLED_STARTUP_READY_TIMEOUT_MS, Math.floor(input.timeoutMs ?? DISTILLED_STARTUP_READY_TIMEOUT_MS)))
  const delayMs = Math.max(1000, Math.min(10_000, Math.floor(input.delayMs ?? 3000)))
  const deadline = Date.now() + timeoutMs
  const readyUrl = `${runpodServerlessRootUrl(input.endpointId)}/ready`
  let lastStatus: number | null = null
  let lastError: string | null = null

  while (Date.now() < deadline) {
    const remaining = Math.max(1000, deadline - Date.now())
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(125_000, remaining))
    try {
      const response = await fetch(readyUrl, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      })
      lastStatus = response.status
      const raw = await response.text()
      if (response.status === 200) return { ok: true, httpStatus: response.status, error: null }
      if (response.status === 204) lastError = null
      const detail = safeRunpodErrorDetail(raw)
      if (detail) lastError = detail
      if (response.status === 503 && detail?.includes('distilled_bootstrap_failed')) {
        return { ok: false, httpStatus: response.status, error: detail }
      }
    } catch (error) {
      lastError = error instanceof Error ? clean(error.message) : 'distilled_startup_probe_failed'
    } finally {
      clearTimeout(timer)
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, Math.max(0, deadline - Date.now()))))
  }

  return {
    ok: false,
    httpStatus: lastStatus,
    error: lastError || 'distilled_model_not_ready_before_startup_deadline',
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

  const readiness = await waitForRunpodServerlessDistilledReady({
    endpointId: input.endpointId,
    timeoutMs: DISTILLED_STARTUP_READY_TIMEOUT_MS,
    delayMs: input.delayMs,
  })
  // A 204 is the startup gateway explicitly saying the worker is healthy but the model is still
  // loading. Use the already-budgeted inference request as the final bounded wait instead of
  // abandoning a healthy worker before that 60-second window begins.
  if (!readiness.ok && readiness.httpStatus !== 204) {
    return {
      ok: false,
      model: DISTILLED_MODEL_NAME,
      httpStatus: readiness.httpStatus,
      text: null,
      error: readiness.error || 'distilled_startup_not_ready',
    }
  }

  const attempts = Math.max(1, Math.min(3, Math.floor(input.attempts ?? 2)))
  const delayMs = Math.max(1000, Math.min(10_000, Math.floor(input.delayMs ?? 5000)))
  const timeoutMs = Math.max(15_000, Math.min(DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS, Math.floor(input.timeoutMs ?? DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS)))
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
      lastError = error instanceof Error ? clean(error.message) : 'distilled_canary_failed'
    } finally {
      clearTimeout(timer)
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return { ok: false, model: DISTILLED_MODEL_NAME, httpStatus: lastStatus, text: null, error: lastError }
}
