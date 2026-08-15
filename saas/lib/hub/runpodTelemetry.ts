// saas/lib/hub/runpodTelemetry.ts
import { configuredRunpodApiKey, configuredRunpodPodId, runpodControlConfigured } from '@/lib/ai/cos/runpodConfig'

const GRAPHQL_ENDPOINT = 'https://api.runpod.io/graphql'
const REST_ENDPOINT = 'https://rest.runpod.io/v1'
const REQUEST_TIMEOUT_MS = 15_000

export type PodStatus = {
  id: string
  name: string
  running: boolean
  desiredStatus: string
  costPerHr: number | null
  uptimeSeconds: number
}

export type PodRuntimeConfig = {
  id: string
  desiredStatus: string
  image: string | null
  dockerEntrypoint: string[]
  dockerStartCmd: string[]
  volumeMountPath: string | null
}

export type RunpodStartupContract = {
  dockerEntrypoint: string[]
  dockerStartCmd: string[]
}

export function runpodConfigured(): boolean {
  return runpodControlConfigured()
}

function fallbackHourlyRate(): number {
  const value = Number(process.env.RUNPOD_FALLBACK_HOURLY_RATE_USD || '0.45')
  return Number.isFinite(value) && value >= 0 ? value : 0.45
}

function safeModelName(value: string | undefined, fallback: string): string {
  const model = value?.trim() || fallback
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) {
    throw new Error(`RunPod startup model contains unsupported shell characters: ${model}`)
  }
  return model
}

/**
 * The Pod's container disk is recreated when RunPod restarts it, while /workspace persists.
 * Therefore the container start command must explicitly launch the persistent COS bootstrap on every
 * cold start. Both historical bootstrap filenames are supported because the live Pod predates the
 * repository-standard /workspace/run-cos-reasoner.sh name.
 */
export function desiredRunpodStartupContract(): RunpodStartupContract {
  const reasonerModel = safeModelName(process.env.LOCAL_AI_MODEL, 'qwen2.5-coder:32b')
  const embeddingModel = safeModelName(process.env.LOCAL_AI_EMBEDDING_MODEL, 'nomic-embed-text')
  const command = [
    'set -euo pipefail',
    'if [ -x /start.sh ]; then nohup /start.sh >/workspace/runpod-base-start.log 2>&1 & fi',
    'script=""',
    'for candidate in /workspace/cos-runpod-reasoner.sh /workspace/run-cos-reasoner.sh; do if [ -x "$candidate" ]; then script="$candidate"; break; fi; done',
    'if [ -z "$script" ]; then echo "COS RunPod bootstrap is missing from /workspace" >&2; exit 78; fi',
    `export COS_REASONER_MODEL='${reasonerModel}'`,
    `export COS_EMBEDDING_MODEL='${embeddingModel}'`,
    '"$script"',
    'exec tail -f /dev/null',
  ].join('; ')
  return {
    dockerEntrypoint: ['bash', '-lc'],
    dockerStartCmd: [command],
  }
}

function sameStringArray(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function runpodStartupContractMatches(config: Pick<PodRuntimeConfig, 'dockerEntrypoint' | 'dockerStartCmd'>): boolean {
  const desired = desiredRunpodStartupContract()
  return sameStringArray(config.dockerEntrypoint, desired.dockerEntrypoint)
    && sameStringArray(config.dockerStartCmd, desired.dockerStartCmd)
}

async function graphqlRequest<T>(query: string): Promise<T> {
  const apiKey = configuredRunpodApiKey()
  if (!apiKey) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${GRAPHQL_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ query }),
    })
    if (!response.ok) throw new Error(`RunPod GraphQL HTTP ${response.status}: ${await response.text()}`)
    const body = await response.json() as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors?.length) throw new Error(`RunPod GraphQL error: ${body.errors.map(e => e.message).join('; ')}`)
    if (!body.data) throw new Error('RunPod GraphQL response carried no data')
    return body.data
  } finally { clearTimeout(timeout) }
}

async function restRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = configuredRunpodApiKey()
  if (!apiKey) throw new Error('RUNPOD_API_KEY is not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${REST_ENDPOINT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`RunPod REST HTTP ${response.status}: ${raw}`)
    if (!raw) return {} as T
    return JSON.parse(raw) as T
  } finally { clearTimeout(timeout) }
}

export async function queryPodStatus(): Promise<PodStatus> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured and could not be derived from LOCAL_AI_BASE_URL')
  const data = await graphqlRequest<{
    myself?: { pods?: Array<{ id: string; name: string; desiredStatus?: string; costPerHr?: number | null; runtime?: { uptimeInSeconds?: number } | null }> }
  }>(`query { myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }`)
  const pod = data.myself?.pods?.find(p => p.id === podId)
  if (!pod) throw new Error(`RunPod pod ${podId} was not found in this account's pod list — it may have been terminated (not merely stopped).`)
  const desiredStatus = String(pod.desiredStatus || 'UNKNOWN')
  return { id: pod.id, name: pod.name || podId, running: desiredStatus === 'RUNNING', desiredStatus, costPerHr: typeof pod.costPerHr === 'number' ? pod.costPerHr : null, uptimeSeconds: Number(pod.runtime?.uptimeInSeconds || 0) }
}

export async function queryPodRuntimeConfig(): Promise<PodRuntimeConfig> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured and could not be derived from LOCAL_AI_BASE_URL')
  const pod = await restRequest<{
    id?: string
    desiredStatus?: string
    image?: string
    imageName?: string
    dockerEntrypoint?: string[] | null
    dockerStartCmd?: string[] | null
    volumeMountPath?: string | null
  }>(`/pods/${encodeURIComponent(podId)}`)
  return {
    id: String(pod.id || podId),
    desiredStatus: String(pod.desiredStatus || 'UNKNOWN'),
    image: typeof pod.image === 'string' ? pod.image : typeof pod.imageName === 'string' ? pod.imageName : null,
    dockerEntrypoint: Array.isArray(pod.dockerEntrypoint) ? pod.dockerEntrypoint.map(String) : [],
    dockerStartCmd: Array.isArray(pod.dockerStartCmd) ? pod.dockerStartCmd.map(String) : [],
    volumeMountPath: typeof pod.volumeMountPath === 'string' ? pod.volumeMountPath : null,
  }
}

export async function configurePodStartupContract(): Promise<PodRuntimeConfig> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured and could not be derived from LOCAL_AI_BASE_URL')
  const desired = desiredRunpodStartupContract()
  const pod = await restRequest<{
    id?: string
    desiredStatus?: string
    image?: string
    imageName?: string
    dockerEntrypoint?: string[] | null
    dockerStartCmd?: string[] | null
    volumeMountPath?: string | null
  }>(`/pods/${encodeURIComponent(podId)}/update`, {
    method: 'POST',
    body: JSON.stringify(desired),
  })
  return {
    id: String(pod.id || podId),
    desiredStatus: String(pod.desiredStatus || 'UNKNOWN'),
    image: typeof pod.image === 'string' ? pod.image : typeof pod.imageName === 'string' ? pod.imageName : null,
    dockerEntrypoint: Array.isArray(pod.dockerEntrypoint) ? pod.dockerEntrypoint.map(String) : desired.dockerEntrypoint,
    dockerStartCmd: Array.isArray(pod.dockerStartCmd) ? pod.dockerStartCmd.map(String) : desired.dockerStartCmd,
    volumeMountPath: typeof pod.volumeMountPath === 'string' ? pod.volumeMountPath : null,
  }
}

export async function startPod(): Promise<{ id: string; desiredStatus: string }> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured and could not be derived from LOCAL_AI_BASE_URL')
  const data = await graphqlRequest<{ podResume?: { id: string; desiredStatus: string } }>(
    `mutation { podResume(input: { podId: "${podId}", gpuCount: 1 }) { id desiredStatus } }`,
  )
  if (!data.podResume) throw new Error('RunPod podResume mutation returned no result')
  return data.podResume
}

export async function stopPod(): Promise<{ id: string; desiredStatus: string }> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured and could not be derived from LOCAL_AI_BASE_URL')
  const data = await graphqlRequest<{ podStop?: { id: string; desiredStatus: string } }>(
    `mutation { podStop(input: { podId: "${podId}" }) { id desiredStatus } }`,
  )
  if (!data.podStop) throw new Error('RunPod podStop mutation returned no result')
  return data.podStop
}

export function estimateSessionCostUsd(status: PodStatus): number {
  const rate = status.costPerHr ?? fallbackHourlyRate()
  return (status.uptimeSeconds / 3600) * rate
}
