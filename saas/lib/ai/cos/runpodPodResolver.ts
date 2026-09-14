import {
  configuredRunpodApiKey,
  explicitRunpodPodId,
  setRuntimeRunpodPodIdOverride,
} from './runpodConfig'

const RUNPOD_GRAPHQL = 'https://api.runpod.io/graphql'
const CANONICAL_REASONER_NAME = 'signalboost-cos-reasoner-v2'
const CACHE_MS = 60_000

let cached: { podId: string; expiresAt: number } | null = null
let resolving: Promise<string> | null = null

type AccountPod = Readonly<{
  id: string
  name: string
  desiredStatus: string
}>

function clean(value: unknown, max = 240): string {
  return String(value ?? '').trim().slice(0, max)
}

function normalizedName(value: unknown): string {
  return clean(value, 240).toLowerCase()
}

async function accountPods(): Promise<AccountPod[]> {
  const apiKey = configuredRunpodApiKey()
  if (!apiKey) throw new Error('RUNPOD_API_KEY is not configured')

  const response = await fetch(`${RUNPOD_GRAPHQL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query { myself { pods { id name desiredStatus } } }',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`RunPod GraphQL HTTP ${response.status}`)

  const body = await response.json() as {
    data?: { myself?: { pods?: Array<{ id?: string; name?: string; desiredStatus?: string }> } }
    errors?: Array<{ message?: string }>
  }
  if (body.errors?.length) {
    throw new Error(`RunPod GraphQL error: ${body.errors.map(error => clean(error.message, 200) || 'unknown').join('; ')}`)
  }

  return (body.data?.myself?.pods || [])
    .map(pod => ({
      id: clean(pod.id, 120),
      name: clean(pod.name, 240),
      desiredStatus: clean(pod.desiredStatus, 60) || 'UNKNOWN',
    }))
    .filter(pod => Boolean(pod.id))
}

function chooseRecoveredPod(pods: readonly AccountPod[]): AccountPod | null {
  const exact = pods.filter(pod => normalizedName(pod.name) === CANONICAL_REASONER_NAME)
  if (exact.length === 1) return exact[0]

  const branded = pods.filter(pod => normalizedName(pod.name).startsWith('signalboost-cos-reasoner'))
  if (branded.length === 1) return branded[0]

  return null
}

/**
 * Resolve the RunPod primary safely without hard-coding an infrastructure id.
 *
 * Normal case: the configured Vercel pod id exists and wins.
 * Recovery case: the configured id is stale/terminated, and the authenticated account proves exactly
 * one canonical SignalBoost COS reasoner pod. That pod becomes an in-process override so every
 * existing lifecycle/gateway call uses the same verified identity. Ambiguity fails closed.
 */
export async function resolveRunpodPrimaryPodId(now = Date.now()): Promise<string> {
  if (cached && cached.expiresAt > now) return cached.podId
  if (resolving) return resolving

  resolving = (async () => {
    const configured = explicitRunpodPodId()
    const pods = await accountPods()

    if (configured && pods.some(pod => pod.id === configured)) {
      setRuntimeRunpodPodIdOverride(null)
      cached = { podId: configured, expiresAt: now + CACHE_MS }
      return configured
    }

    const recovered = chooseRecoveredPod(pods)
    if (!recovered) {
      const reason = configured
        ? `configured RunPod pod ${configured} is absent and no unique canonical SignalBoost reasoner pod was found`
        : 'no configured RunPod pod id and no unique canonical SignalBoost reasoner pod was found'
      throw new Error(`runpod_primary_resolution_failed:${reason}`)
    }

    setRuntimeRunpodPodIdOverride(recovered.id)
    cached = { podId: recovered.id, expiresAt: now + CACHE_MS }
    console.warn('[runpod-primary-pod-id-recovered]', JSON.stringify({
      configuredPodId: configured || null,
      resolvedPodId: recovered.id,
      resolvedPodName: recovered.name,
      desiredStatus: recovered.desiredStatus,
      persisted: false,
    }))
    return recovered.id
  })()

  try {
    return await resolving
  } finally {
    resolving = null
  }
}

export function clearRunpodPrimaryPodResolutionCache(): void {
  cached = null
  resolving = null
}
