// saas/lib/hub/runpodTelemetry.ts
import { createHmac } from 'node:crypto'
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

export type RunpodAccountStatus = {
  clientBalance: number | null
  currentSpendPerHr: number | null
  spendLimit: number | null
  underBalance: boolean | null
  minBalance: number | null
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

export type RunpodStartupOptions = Readonly<{
  reasonerModel?: string | null
  embeddingModel?: string | null
}>

export function runpodConfigured(): boolean {
  return runpodControlConfigured()
}

function fallbackHourlyRate(): number {
  const value = Number(process.env.RUNPOD_FALLBACK_HOURLY_RATE_USD || '0.49')
  return Number.isFinite(value) && value >= 0 ? value : 0.49
}

function safeModelName(value: string | undefined | null, fallback: string): string {
  const model = value?.trim() || fallback
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) {
    throw new Error(`RunPod startup model contains unsupported shell characters: ${model}`)
  }
  return model
}

function bootstrapRef(): string {
  const value = String(process.env.RUNPOD_BOOTSTRAP_REF || process.env.VERCEL_GIT_COMMIT_SHA || 'main').trim()
  return /^[a-f0-9]{40}$/i.test(value) ? value : 'main'
}

/**
 * Derive an inference-only credential from the RunPod control credential. The root RunPod API key is
 * never sent to the model gateway or written into the Pod startup contract. Compromise of this
 * derived token grants only access to the authenticated inference proxy, not RunPod account control.
 */
export function runpodGatewayKey(podId = configuredRunpodPodId()): string {
  const apiKey = configuredRunpodApiKey()
  if (!apiKey) throw new Error('RUNPOD_API_KEY is not configured')
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
  return createHmac('sha256', apiKey)
    .update(`itmounts-runpod-inference-v1:${podId}`)
    .digest('hex')
}

/**
 * The Pod's container disk is recreated when RunPod restarts it, while /workspace persists.
 * Every start downloads the bootstrap from the exact Vercel Git commit, making Pod behavior
 * reproducible instead of trusting whatever script happened to remain on persistent storage.
 */
export function desiredRunpodStartupContract(options: RunpodStartupOptions = {}): RunpodStartupContract {
  const reasonerModel = safeModelName(options.reasonerModel || process.env.RUNPOD_PRIMARY_MODEL, 'qwen2.5-coder:32b')
  const embeddingModel = safeModelName(options.embeddingModel || process.env.RUNPOD_PRIMARY_EMBEDDING_MODEL, 'nomic-embed-text')
  const gatewayKey = runpodGatewayKey()
  const ref = bootstrapRef()
  const bootstrapUrl = `https://raw.githubusercontent.com/SignalBoost/signalboost-live/${ref}/saas/scripts/runpod-cos-reasoner.sh`
  const command = [
    'set -euo pipefail',
    'if [ -x /start.sh ]; then nohup /start.sh >/workspace/runpod-base-start.log 2>&1 & fi',
    `curl -fsSL --max-time 30 '${bootstrapUrl}' -o /workspace/cos-runpod-reasoner.sh`,
    'chmod 700 /workspace/cos-runpod-reasoner.sh',
    `export COS_REASONER_MODEL='${reasonerModel}'`,
    `export COS_EMBEDDING_MODEL='${embeddingModel}'`,
    `export COS_REASONER_GATEWAY_KEY='${gatewayKey}'`,
    '/workspace/cos-runpod-reasoner.sh',
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

export function runpodStartupContractMatches(
  config: Pick<PodRuntimeConfig, 'dockerEntrypoint' | 'dockerStartCmd'>,
  options: RunpodStartupOptions = {},
): boolean {
  const desired = desiredRunpodStartupContract(options)
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

function finiteOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function queryRunpodAccountStatus(): Promise<RunpodAccountStatus> {
  const data = await graphqlRequest<{
    myself?: {
      clientBalance?: number | null
      currentSpendPerHr?: number | null
      spendLimit?: number | null
      underBalance?: boolean | null
      minBalance?: number | null
    }
  }>('query { myself { clientBalance currentSpendPerHr spendLimit underBalance minBalance } }')
  const account = data.myself
  if (!account) throw new Error('RunPod account status was unavailable')
  return {
    clientBalance: finiteOrNull(account.clientBalance),
    currentSpendPerHr: finiteOrNull(account.currentSpendPerHr),
    spendLimit: finiteOrNull(account.spendLimit),
    underBalance: typeof account.underBalance === 'boolean' ? account.underBalance : null,
    minBalance: finiteOrNull(account.minBalance),
  }
}

export async function queryPodStatus(): Promise<PodStatus> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
  const data = await graphqlRequest<{
    myself?: { pods?: Array<{ id: string; name: string; desiredStatus?: string; costPerHr?: number | null; runtime?: { uptimeInSeconds?: number } | null }> }
  }>('query { myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }')
  const pod = data.myself?.pods?.find(p => p.id === podId)
  if (!pod) throw new Error(`RunPod pod ${podId} was not found in this account's pod list — it may have been terminated (not merely stopped).`)
  const desiredStatus = String(pod.desiredStatus || 'UNKNOWN')
  return {
    id: pod.id,
    name: pod.name || podId,
    running: desiredStatus === 'RUNNING',
    desiredStatus,
    costPerHr: typeof pod.costPerHr === 'number' ? pod.costPerHr : null,
    uptimeSeconds: Number(pod.runtime?.uptimeInSeconds || 0),
  }
}

export async function queryPodRuntimeConfig(): Promise<PodRuntimeConfig> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
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

export async function configurePodStartupContract(options: RunpodStartupOptions = {}): Promise<PodRuntimeConfig> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
  const desired = desiredRunpodStartupContract(options)
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
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
  const data = await graphqlRequest<{ podResume?: { id: string; desiredStatus: string } }>(
    `mutation { podResume(input: { podId: "${podId}", gpuCount: 1 }) { id desiredStatus } }`,
  )
  if (!data.podResume) throw new Error('RunPod podResume mutation returned no result')
  return data.podResume
}

export async function stopPod(): Promise<{ id: string; desiredStatus: string }> {
  const podId = configuredRunpodPodId()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')
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
