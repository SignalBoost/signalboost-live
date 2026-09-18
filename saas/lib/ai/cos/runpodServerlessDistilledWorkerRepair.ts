import { configuredRunpodApiKey } from './runpodConfig.ts'
import {
  DISTILLED_ADAPTER_MODEL_ID,
  DISTILLED_ADAPTER_MODEL_REVISION,
  DISTILLED_BASE_MODEL_ID,
  DISTILLED_BASE_MODEL_REVISION,
  DISTILLED_IDLE_TIMEOUT_SECONDS,
  DISTILLED_MODEL_NAME,
  DISTILLED_TEMPLATE_NAME,
  safeRunpodErrorDetail,
} from './runpodServerlessDistilledProvision.ts'

const REST = 'https://rest.runpod.io/v1'
const RUNPOD_WORKER_VLLM_IMAGE = 'runpod/worker-v1-vllm:v2.27.0'
const REQUEST_TIMEOUT_MS = 15_000

type RunpodEndpoint = Readonly<{ id?: string; templateId?: string; name?: string }>
type RunpodTemplate = Readonly<{ id?: string; name?: string; imageName?: string }>

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function runpodRest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

/**
 * Queue-based RunPod Serverless vLLM requires RunPod's worker wrapper. The vanilla
 * vllm/vllm-openai image is a direct HTTP server and does not register the Serverless worker loop.
 * Download only the exact immutable LoRA revision before handing control to /src/main.py.
 */
function exactWorkerStartupCommand(): string {
  const repo = JSON.stringify(DISTILLED_ADAPTER_MODEL_ID)
  const revision = JSON.stringify(DISTILLED_ADAPTER_MODEL_REVISION)
  const adapterName = JSON.stringify(DISTILLED_MODEL_NAME)
  const baseModel = JSON.stringify(DISTILLED_BASE_MODEL_ID)
  return [
    'set -euo pipefail',
    `export ADAPTER_PATH="$(python3 -c 'from huggingface_hub import snapshot_download; import os; print(snapshot_download(repo_id=${repo}, revision=${revision}, token=os.environ["HF_TOKEN"]))')"`,
    `export LORA_MODULES="$(python3 -c 'import json,os; print(json.dumps([{"name":${adapterName},"path":os.environ["ADAPTER_PATH"],"base_model_name":${baseModel}}]))')"`,
    'exec python3 /src/main.py',
  ].join('; ')
}

function hfToken(): string {
  const token = process.env.HF_TOKEN?.trim() || ''
  if (token.length < 20) throw new Error('HF_TOKEN is not configured for private distilled adapter access')
  return token
}

function workerTemplatePayload(token: string) {
  return {
    imageName: RUNPOD_WORKER_VLLM_IMAGE,
    name: DISTILLED_TEMPLATE_NAME,
    containerDiskInGb: 50,
    dockerEntrypoint: ['bash', '-lc'],
    dockerStartCmd: [exactWorkerStartupCommand()],
    env: {
      HF_TOKEN: token,
      MODEL_NAME: DISTILLED_BASE_MODEL_ID,
      MODEL_REVISION: DISTILLED_BASE_MODEL_REVISION,
      BASE_PATH: '/models',
      HF_HOME: '/models/hf-cache',
      ENABLE_LORA: 'true',
      MAX_LORAS: '1',
      MAX_LORA_RANK: '16',
      MAX_CPU_LORAS: '1',
      GPU_MEMORY_UTILIZATION: '0.85',
      MAX_MODEL_LEN: '16384',
      MAX_CONCURRENCY: '1',
      ENABLE_LOG_REQUESTS: 'false',
    },
    isPublic: false,
    ports: [],
    readme: 'iTMounts exact distilled Qwen3-4B + immutable LoRA on RunPod worker-vllm v2.27.0. Queue-based Serverless, scale-to-zero, evaluation before Production activation.',
  }
}

export async function reconcileRunpodServerlessDistilledWorkerTemplate(endpointIdInput: string): Promise<{
  endpointId: string
  templateId: string
  imageName: string
  exactAdapterRevision: string
}> {
  const endpointId = clean(endpointIdInput, 120)
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(endpointId)) throw new Error('RunPod endpoint id is invalid')

  const endpoints = await runpodRest<RunpodEndpoint[]>('/endpoints')
  const endpoint = endpoints.find(item => clean(item.id, 120) === endpointId)
  const templateId = clean(endpoint?.templateId, 120)
  if (!templateId) throw new Error('RunPod distilled endpoint template binding missing')

  const updated = await runpodRest<RunpodTemplate>(`/templates/${encodeURIComponent(templateId)}/update`, {
    method: 'POST',
    body: JSON.stringify(workerTemplatePayload(hfToken())),
  })
  if (clean(updated.id, 120) !== templateId) throw new Error('RunPod distilled template update identity mismatch')
  if (clean(updated.imageName, 240) !== RUNPOD_WORKER_VLLM_IMAGE) throw new Error('RunPod distilled template worker image mismatch')

  return Object.freeze({
    endpointId,
    templateId,
    imageName: RUNPOD_WORKER_VLLM_IMAGE,
    exactAdapterRevision: DISTILLED_ADAPTER_MODEL_REVISION,
  })
}

export const DISTILLED_RUNPOD_WORKER_IMAGE = RUNPOD_WORKER_VLLM_IMAGE
export const DISTILLED_RUNPOD_WORKER_WARM_SECONDS = DISTILLED_IDLE_TIMEOUT_SECONDS
