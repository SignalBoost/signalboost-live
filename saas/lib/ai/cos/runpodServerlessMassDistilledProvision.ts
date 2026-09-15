import { configuredRunpodApiKey } from './runpodConfig.ts'
import {
  runpodServerlessEndpointHealth,
  runpodServerlessOpenAiBaseUrl,
  safeRunpodErrorDetail,
  type RunpodServerlessHealth,
} from './runpodServerlessDistilledProvision.ts'

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const PUBLIC_PORT = 8000
const INTERNAL_VLLM_PORT = 8001
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0.69
export const MASS_DISTILLED_IDLE_TIMEOUT_SECONDS = 300
export const MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS = 220_000
export const MASS_DISTILLED_CANARY_TIMEOUT_MS = 60_000

const MASS_CANDIDATE = /^mass:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([a-f0-9]{16})$/i
const HEX40 = /^[a-f0-9]{40}$/i
const HEX64 = /^[a-f0-9]{64}$/i
const MODEL_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const APPROVED_SERVERLESS_GPU_POOLS = new Set(['AMPERE_16', 'AMPERE_24'])
const PREFERRED_GPU_TYPE_IDS = [
  'NVIDIA RTX A4000',
  'NVIDIA RTX A4500',
  'NVIDIA RTX 4000 Ada Generation',
  'NVIDIA RTX A5000',
  'NVIDIA GeForce RTX 3090',
  'NVIDIA L4',
]

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
  scaling?: { type?: string; requestCount?: number }
  timeout?: number
  gpu?: { pools?: string[]; count?: number }
}
type RunpodGpuCatalogItemV2 = {
  id?: string
  pool?: string
  manufacturer?: string
  memory?: number
  availability?: string
  price?: { serverless?: number | null }
}

export type MassDistilledRuntimeSpec = Readonly<{
  candidateId: string
  artifactHash: string
  baseModelId: string
  baseModelRevision: string
  adapterModelId: string
  adapterModelRevision: string
  modelName: string
  templateName: string
  endpointName: string
}>

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function finitePrice(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function massDistilledRuntimeSpec(input: {
  candidateId: unknown
  artifactHash: unknown
  baseModelId: unknown
  baseModelRevision: unknown
  adapterModelId: unknown
  adapterModelRevision: unknown
}): MassDistilledRuntimeSpec {
  const candidateId = clean(input.candidateId, 140)
  const artifactHash = clean(input.artifactHash, 64).toLowerCase()
  const baseModelId = clean(input.baseModelId, 240)
  const baseModelRevision = clean(input.baseModelRevision, 40).toLowerCase()
  const adapterModelId = clean(input.adapterModelId, 240)
  const adapterModelRevision = clean(input.adapterModelRevision, 40).toLowerCase()
  if (!MASS_CANDIDATE.test(candidateId)) throw new Error('mass_distilled_runtime_candidate_invalid')
  if (!HEX64.test(artifactHash)) throw new Error('mass_distilled_runtime_artifact_hash_invalid')
  if (!MODEL_ID.test(baseModelId) || !HEX40.test(baseModelRevision)) throw new Error('mass_distilled_runtime_base_identity_invalid')
  if (!MODEL_ID.test(adapterModelId) || !HEX40.test(adapterModelRevision)) throw new Error('mass_distilled_runtime_adapter_identity_invalid')
  const suffix = artifactHash.slice(0, 16)
  return Object.freeze({
    candidateId,
    artifactHash,
    baseModelId,
    baseModelRevision,
    adapterModelId,
    adapterModelRevision,
    modelName: `itmounts-distilled-${suffix}`,
    templateName: `itmounts-distilled-${suffix}-t1`,
    endpointName: `itmounts-distilled-${suffix}-e1`,
  })
}

async function requestV1<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response = await fetch(`${REST_V1}${path}`, {
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
    const detail = safeRunpodErrorDetail(raw)
    throw new Error(`RunPod REST v1 ${String(init.method || 'GET').toUpperCase()} ${path} HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return raw ? JSON.parse(raw) as T : {} as T
}

async function requestV2<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response = await fetch(`${CONTROL_API_V2}${path}`, {
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
    const detail = safeRunpodErrorDetail(raw)
    throw new Error(`RunPod REST v2 ${String(init.method || 'GET').toUpperCase()} ${path} HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return raw ? JSON.parse(raw) as T : {} as T
}

function hfToken(): string {
  const token = clean(process.env.HF_TOKEN, 4096)
  if (token.length < 20) throw new Error('HF_TOKEN is not configured for private distilled adapter access')
  return token
}

function gatewaySource(): string {
  return String.raw`import asyncio
import json
import os
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
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
            base_path = await asyncio.to_thread(snapshot_download, repo_id=BASE_ID, revision=BASE_REV, local_dir="/models/base", token=HF_TOKEN)
        adapter_path = await asyncio.to_thread(snapshot_download, repo_id=ADAPTER_ID, revision=ADAPTER_REV, local_dir="/models/adapter", token=HF_TOKEN)
        lora = json.dumps({"name": DISTILLED_MODEL, "path": adapter_path, "base_model_name": BASE_ID})
        vllm_process = await asyncio.create_subprocess_exec(
            "vllm", "serve", base_path,
            "--host", "127.0.0.1", "--port", str(INTERNAL_PORT),
            "--served-model-name", BASE_ID,
            "--enable-lora", "--max-lora-rank", "16", "--max-loras", "1", "--max-cpu-loras", "1",
            "--lora-modules", lora, "--gpu-memory-utilization", "0.85", "--max-model-len", "16384", "--dtype", "auto",
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
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.request(request.method, f"http://127.0.0.1:{INTERNAL_PORT}{path}", content=body, headers={"content-type": request.headers.get("content-type", "application/json")})
    return Response(content=response.content, status_code=response.status_code, media_type=response.headers.get("content-type", "application/json"))

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

function startupCommand(spec: MassDistilledRuntimeSpec): string {
  const gateway = Buffer.from(gatewaySource(), 'utf8').toString('base64')
  return [
    'set -euo pipefail',
    'mkdir -p /models/base /models/adapter /models/hf-cache',
    `export ITMOUNTS_BASE_MODEL_ID='${spec.baseModelId}'`,
    `export ITMOUNTS_BASE_MODEL_REVISION='${spec.baseModelRevision}'`,
    `export ITMOUNTS_ADAPTER_MODEL_ID='${spec.adapterModelId}'`,
    `export ITMOUNTS_ADAPTER_MODEL_REVISION='${spec.adapterModelRevision}'`,
    `export ITMOUNTS_DISTILLED_MODEL_NAME='${spec.modelName}'`,
    `export ITMOUNTS_INTERNAL_VLLM_PORT='${INTERNAL_VLLM_PORT}'`,
    `python3 -c "import base64; open('/tmp/itmounts_distilled_gateway.py','wb').write(base64.b64decode('${gateway}'))"`,
    'exec python3 /tmp/itmounts_distilled_gateway.py',
  ].join('; ')
}

function templateHasExactBootstrap(template: RunpodTemplateV1, spec: MassDistilledRuntimeSpec): boolean {
  const command = (template.dockerStartCmd || []).join(' ')
  return template.imageName === VLLM_IMAGE
    && (template.dockerEntrypoint || []).includes('bash')
    && command.includes(spec.baseModelId)
    && command.includes(spec.baseModelRevision)
    && command.includes(spec.adapterModelId)
    && command.includes(spec.adapterModelRevision)
    && command.includes('itmounts_distilled_gateway.py')
    && (template.ports || []).includes(`${PUBLIC_PORT}/http`)
}

function endpointPolicy() {
  return {
    workers: { min: 0, max: 1, idleTimeout: MASS_DISTILLED_IDLE_TIMEOUT_SECONDS },
    scaling: { type: 'REQUEST_COUNT', requestCount: 1 },
    timeout: 300_000,
    flashboot: 'FLASHBOOT',
  }
}

async function gpuSelection(): Promise<{ pools: string[]; ids: string[] }> {
  const catalog = await requestV2<{ gpus?: RunpodGpuCatalogItemV2[] }>('/catalog/gpus')
  const candidates = (catalog.gpus || [])
    .filter(item => clean(item.manufacturer, 40).toUpperCase() === 'NVIDIA')
    .filter(item => Number(item.memory || 0) >= 16 && Number(item.memory || 0) <= 24)
    .map(item => ({
      id: clean(item.id, 160),
      pool: clean(item.pool, 80),
      price: finitePrice(item.price?.serverless),
      availability: clean(item.availability, 40).toUpperCase(),
    }))
    .filter(item => item.id && APPROVED_SERVERLESS_GPU_POOLS.has(item.pool) && item.price !== null && item.price <= MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD && item.availability !== 'NONE')
    .sort((a, b) => {
      const ai = PREFERRED_GPU_TYPE_IDS.indexOf(a.id)
      const bi = PREFERRED_GPU_TYPE_IDS.indexOf(b.id)
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
      return (a.price || Infinity) - (b.price || Infinity)
    })
  if (!candidates.length) throw new Error('mass_distilled_runtime_no_approved_serverless_gpu')
  const pools = [...new Set(candidates.map(item => item.pool))].slice(0, 2)
  const ids = [...new Set(candidates.filter(item => pools.includes(item.pool)).map(item => item.id))].slice(0, 8)
  return { pools, ids }
}

function assertEndpoint(endpoint: RunpodEndpointV2, spec: MassDistilledRuntimeSpec) {
  if (endpoint.name !== spec.endpointName) throw new Error('mass_distilled_runtime_endpoint_name_mismatch')
  if (endpoint.type && endpoint.type !== 'LOAD_BALANCER') throw new Error('mass_distilled_runtime_routing_mismatch')
  const min = Number(endpoint.workers?.min ?? Number.NaN)
  const max = Number(endpoint.workers?.max ?? Number.NaN)
  const idle = Number(endpoint.workers?.idleTimeout ?? Number.NaN)
  if (min !== 0 || max !== 1 || !Number.isFinite(idle) || idle > MASS_DISTILLED_IDLE_TIMEOUT_SECONDS) {
    throw new Error('mass_distilled_runtime_worker_policy_mismatch')
  }
  if (endpoint.scaling?.type && endpoint.scaling.type !== 'REQUEST_COUNT') throw new Error('mass_distilled_runtime_scaler_mismatch')
  if (Number(endpoint.scaling?.requestCount ?? 1) > 1) throw new Error('mass_distilled_runtime_scaler_threshold_mismatch')
  if (Number(endpoint.timeout ?? 300_000) > 300_000) throw new Error('mass_distilled_runtime_timeout_policy_mismatch')
  if (endpoint.gpu?.count !== undefined && Number(endpoint.gpu.count) !== 1) throw new Error('mass_distilled_runtime_gpu_count_mismatch')
}

export async function provisionMassDistilledRuntime(spec: MassDistilledRuntimeSpec) {
  const token = hfToken()
  const templates = await requestV1<RunpodTemplateV1[]>('/templates')
  let template = templates.find(item => item.name === spec.templateName && item.isServerless !== false)
  let createdTemplate = false
  if (template && !templateHasExactBootstrap(template, spec)) throw new Error('mass_distilled_runtime_template_identity_mismatch')
  if (!template) {
    template = await requestV1<RunpodTemplateV1>('/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: spec.templateName,
        imageName: VLLM_IMAGE,
        category: 'NVIDIA',
        containerDiskInGb: 50,
        dockerEntrypoint: ['bash', '-lc'],
        dockerStartCmd: [startupCommand(spec)],
        env: {
          HF_TOKEN: token,
          HF_HOME: '/models/hf-cache',
          PORT: String(PUBLIC_PORT),
          PORT_HEALTH: String(PUBLIC_PORT),
          HEALTH_CHECK_PATH: '/ping',
        },
        isPublic: false,
        isServerless: true,
        ports: [`${PUBLIC_PORT}/http`],
        readme: 'iTMounts exact mass-distilled Qwen3-4B + immutable LoRA startup-gateway runtime. Scale-to-zero. Evaluation only; no Production traffic authorization.',
      }),
    })
    createdTemplate = true
  }
  if (!template?.id) throw new Error('mass_distilled_runtime_template_missing_id')

  const endpoints = await requestV2<{ endpoints?: RunpodEndpointV2[] }>('/serverless')
  let endpoint = (endpoints.endpoints || []).find(item => item.name === spec.endpointName)
  let createdEndpoint = false
  let gpuIds: string[] = []
  if (endpoint && endpoint.templateId && endpoint.templateId !== template.id) throw new Error('mass_distilled_runtime_endpoint_template_mismatch')
  if (!endpoint) {
    const gpu = await gpuSelection()
    gpuIds = gpu.ids
    endpoint = await requestV2<RunpodEndpointV2>('/serverless', {
      method: 'POST',
      body: JSON.stringify({
        name: spec.endpointName,
        type: 'LOAD_BALANCER',
        templateId: template.id,
        gpu: { pools: gpu.pools, count: 1 },
        ...endpointPolicy(),
      }),
    })
    createdEndpoint = true
  } else {
    gpuIds = (endpoint.gpu?.pools || []).map(pool => `pool:${clean(pool, 80)}`)
  }
  if (!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_missing_id')
  assertEndpoint(endpoint, spec)
  return Object.freeze({
    createdTemplate,
    createdEndpoint,
    templateId: template.id,
    endpointId: endpoint.id,
    endpointName: spec.endpointName,
    model: spec.modelName,
    baseUrl: runpodServerlessOpenAiBaseUrl(endpoint.id),
    workersMin: 0,
    workersMax: 1,
    idleTimeout: MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
    gpuTypes: Object.freeze(gpuIds),
  })
}

export async function reconcileMassDistilledRuntime(endpointId: string, spec: MassDistilledRuntimeSpec) {
  const endpoints = await requestV2<{ endpoints?: RunpodEndpointV2[] }>('/serverless')
  const endpoint = (endpoints.endpoints || []).find(item => item.id === endpointId)
  if (!endpoint) throw new Error('mass_distilled_runtime_endpoint_missing')
  assertEndpoint(endpoint, spec)
  return Object.freeze({ endpointId, workersMin: 0, workersMax: 1, idleTimeout: MASS_DISTILLED_IDLE_TIMEOUT_SECONDS })
}

export async function waitForMassDistilledReady(endpointId: string) {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const url = `https://${endpointId}.api.runpod.ai/ready`
  const deadline = Date.now() + MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS
  let httpStatus: number | null = null
  let error: string | null = null
  while (Date.now() < deadline) {
    const remaining = Math.max(1000, deadline - Date.now())
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(Math.min(125_000, remaining)),
      })
      httpStatus = response.status
      const raw = await response.text()
      if (response.status === 200) return Object.freeze({ ok: true as const, httpStatus, error: null })
      const detail = safeRunpodErrorDetail(raw)
      if (detail) error = detail
      if (response.status === 503 && detail?.includes('distilled_bootstrap_failed')) return Object.freeze({ ok: false as const, httpStatus, error: detail })
    } catch (cause) {
      error = cause instanceof Error ? clean(cause.message, 300) : 'mass_distilled_runtime_ready_probe_failed'
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 3000))
  }
  return Object.freeze({ ok: false as const, httpStatus, error: error || 'mass_distilled_runtime_startup_timeout' })
}

export async function canaryMassDistilledRuntime(input: { endpointId: string; spec: MassDistilledRuntimeSpec }) {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const ready = await waitForMassDistilledReady(input.endpointId)
  if (!ready.ok) return Object.freeze({ ok: false as const, model: input.spec.modelName, httpStatus: ready.httpStatus, text: null, error: ready.error })
  try {
    const response = await fetch(`${runpodServerlessOpenAiBaseUrl(input.endpointId)}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.spec.modelName,
        max_tokens: 64,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Return one concise sentence. Do not reveal hidden reasoning.' },
          { role: 'user', content: 'State the operational principle: evidence should be separated from inference.' },
        ],
      }),
      signal: AbortSignal.timeout(MASS_DISTILLED_CANARY_TIMEOUT_MS),
    })
    const raw = await response.text()
    if (!response.ok) return Object.freeze({ ok: false as const, model: input.spec.modelName, httpStatus: response.status, text: null, error: safeRunpodErrorDetail(raw) || `HTTP ${response.status}` })
    let payload: any = null
    try { payload = JSON.parse(raw) } catch { payload = null }
    const text = clean(payload?.choices?.[0]?.message?.content, 4000)
    if (!text) return Object.freeze({ ok: false as const, model: input.spec.modelName, httpStatus: response.status, text: null, error: 'mass_distilled_canary_empty_response' })
    return Object.freeze({ ok: true as const, model: input.spec.modelName, httpStatus: response.status, text, error: null })
  } catch (cause) {
    return Object.freeze({ ok: false as const, model: input.spec.modelName, httpStatus: null, text: null, error: cause instanceof Error ? clean(cause.message, 300) : 'mass_distilled_canary_failed' })
  }
}

export { runpodServerlessEndpointHealth }
export type { RunpodServerlessHealth }
