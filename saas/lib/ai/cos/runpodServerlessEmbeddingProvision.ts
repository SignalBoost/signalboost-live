import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST = 'https://rest.runpod.io/v1'
const TEMPLATE_NAME = 'itmounts-embedding-serverless-v1'
const ENDPOINT_NAME = 'itmounts-embedding-primary'
const IMAGE = 'ghcr.io/signalboost/itmounts-embedding-serverless:latest'
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
    if (!response.ok) throw new Error(`RunPod REST HTTP ${response.status}: ${raw.slice(0, 500)}`)
    return raw ? JSON.parse(raw) as T : {} as T
  } finally {
    clearTimeout(timer)
  }
}

function liveEmbeddingModel(): string {
  const model = process.env.LOCAL_AI_EMBEDDING_MODEL?.trim()
  if (!model) throw new Error('LOCAL_AI_EMBEDDING_MODEL is not configured in Production')
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) throw new Error('LOCAL_AI_EMBEDDING_MODEL contains unsupported characters')
  return model
}

export async function provisionRunpodServerlessEmbedding(): Promise<{
  createdTemplate: boolean
  createdEndpoint: boolean
  templateId: string
  endpointId: string
  baseUrl: string
  model: string
  workersMin: number
  workersMax: number
}> {
  const model = liveEmbeddingModel()
  const templates = await request<RunpodTemplate[]>('/templates')
  let template = templates.find(item => item.name === TEMPLATE_NAME && item.isServerless !== false)
  let createdTemplate = false

  if (!template) {
    template = await request<RunpodTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: TEMPLATE_NAME,
        imageName: IMAGE,
        category: 'NVIDIA',
        containerDiskInGb: 10,
        dockerEntrypoint: [],
        dockerStartCmd: [],
        env: {
          EMBEDDING_MODEL: model,
          EMBEDDING_MODEL_CACHE: '/models/cache',
          PORT: '8000',
          PORT_HEALTH: '8000',
        },
        isPublic: false,
        isServerless: true,
        ports: ['8000/http'],
        readme: 'iTMounts scale-to-zero embedding primary. DeepInfra remains fallback.',
        volumeInGb: 0,
        volumeMountPath: '/workspace',
      }),
    })
    createdTemplate = true
  }

  const endpoints = await request<RunpodEndpoint[]>('/endpoints')
  let endpoint = endpoints.find(item => item.name === ENDPOINT_NAME)
  let createdEndpoint = false

  if (!endpoint) {
    endpoint = await request<RunpodEndpoint>('/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        templateId: template.id,
        computeType: 'GPU',
        executionTimeoutMs: 60_000,
        flashboot: true,
        gpuCount: 1,
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

  if (!endpoint.id) throw new Error('RunPod endpoint response carried no endpoint id')
  if (Number(endpoint.workersMin ?? 0) !== 0) throw new Error('RunPod embedding endpoint is not scale-to-zero')

  return {
    createdTemplate,
    createdEndpoint,
    templateId: template.id,
    endpointId: endpoint.id,
    baseUrl: `https://${endpoint.id}.api.runpod.ai/v1`,
    model,
    workersMin: Number(endpoint.workersMin ?? 0),
    workersMax: Number(endpoint.workersMax ?? 1),
  }
}
