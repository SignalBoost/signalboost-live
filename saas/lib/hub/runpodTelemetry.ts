// saas/lib/hub/runpodTelemetry.ts
import { configuredRunpodApiKey, configuredRunpodPodId, runpodControlConfigured } from '@/lib/ai/cos/runpodConfig'

const GRAPHQL_ENDPOINT = 'https://api.runpod.io/graphql'
const REQUEST_TIMEOUT_MS = 15_000

export type PodStatus = {
  id: string
  name: string
  running: boolean
  desiredStatus: string
  costPerHr: number | null
  uptimeSeconds: number
}

export function runpodConfigured(): boolean {
  return runpodControlConfigured()
}

function fallbackHourlyRate(): number {
  const value = Number(process.env.RUNPOD_FALLBACK_HOURLY_RATE_USD || '0.45')
  return Number.isFinite(value) && value >= 0 ? value : 0.45
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
