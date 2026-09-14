import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST = 'https://rest.runpod.io/v1'
export const DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-v1'
export const DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-primary'
export const DISTILLED_MODEL_NAME = 'itmounts-distilled-reasoning-v1'
export const DISTILLED_BASE_MODEL_ID = 'Qwen/Qwen3-4B'
export const DISTILLED_BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
export const DISTILLED_ADAPTER_MODEL_ID = 'cadomos/itmounts-student-f993a365a01e'
export const DISTILLED_ADAPTER_MODEL_REVISION = '9f03387d87de550b96d973f9f30a3f02e783997e'
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const REQUEST_TIMEOUT_MS = 15_000

const GPU_TYPES = [
  'NVIDIA RTX A4000',
  'NVIDIA RTX A4500',
  'NVIDIA RTX 4000 Ada Generation',
]

type RunpodTemplate = { id: string; name: string; imageName?: string; isServerless?: boolean }
type RunpodEndpoint = { id: string; name: string; workersMin?: number; workersMax?: number; templateId?: string }

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
    if (!response.ok) throw new Error(`RunPod REST HTTP ${response.status}`)
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

export async function provisionRunpodServerlessDistilledLlm(): Promise<{
  createdTemplate: boolean
  createdEndpoint: boolean
  templateId: string
  endpointId: string
  baseUrl: string
  model: string
  workersMin: number
  workersMax: number
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
        containerDiskInGb: 30,
        dockerEntrypoint: ['bash', '-lc'],
        dockerStartCmd: [startupCommand()],
        env: {
          HF_TOKEN: token,
          HF_HOME: '/models/hf-cache',
          PORT: '8000',
        },
        isPublic: false,
        isServerless: true,
        ports: ['8000/http'],
        readme: 'iTMounts exact distilled Qwen3-4B + LoRA runtime on public vLLM image. Scale-to-zero. DeepInfra remains fallback until promotion.',
        volumeInGb: 0,
        volumeMountPath: '/workspace',
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
        executionTimeoutMs: 300_000,
        flashboot: true,
        gpuCount: 1,
        // RunPod rents GPU types in list order; there is no separate gpuTypePriority field.
        gpuTypeIds: GPU_TYPES,
        idleTimeout: 5,
        scalerType: 'REQUEST_COUNT',
        scalerValue: 1,
        workersMax: 1,
        workersMin: 0,
      }),
    })
    createdEndpoint = true
  }

  if (!endpoint.id) throw new Error('RunPod distilled endpoint response carried no endpoint id')
  if (Number(endpoint.workersMin ?? 0) !== 0) throw new Error('RunPod distilled endpoint is not scale-to-zero')
  if (Number(endpoint.workersMax ?? 1) > 1) throw new Error('RunPod distilled endpoint exceeds the approved one-worker ceiling')

  return {
    createdTemplate,
    createdEndpoint,
    templateId: template.id,
    endpointId: endpoint.id,
    baseUrl: `https://${endpoint.id}.api.runpod.ai/v1`,
    model: DISTILLED_MODEL_NAME,
    workersMin: Number(endpoint.workersMin ?? 0),
    workersMax: Number(endpoint.workersMax ?? 1),
    gpuTypes: Object.freeze([...GPU_TYPES]),
  }
}

export async function canaryRunpodServerlessDistilledLlm(input: {
  endpointId: string
  attempts?: number
  delayMs?: number
}): Promise<{ ok: boolean; model: string; httpStatus: number | null; text: string | null; error: string | null }> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  const attempts = Math.max(1, Math.min(6, Math.floor(input.attempts ?? 5)))
  const delayMs = Math.max(1000, Math.min(10_000, Math.floor(input.delayMs ?? 5000)))
  let lastStatus: number | null = null
  let lastError: string | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`https://${input.endpointId}.api.runpod.ai/v1/chat/completions`, {
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
        lastError = `HTTP ${response.status}`
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