// Cost-control lifecycle for a dedicated RunPod COS reasoner.
// When RunPod credentials are configured, lifecycle management is enabled by default so the
// dedicated GPU can be stopped while idle and resumed only when COS actually needs local compute.
// Either lifecycle control or idle-stop can still be disabled explicitly with an environment flag.

const RUNPOD_GRAPHQL_URL = 'https://api.runpod.io/graphql'

function booleanOverride(name: string): boolean | null {
  const value = process.env[name]?.trim().toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export function runpodLifecycleConfigured(): boolean {
  return Boolean(process.env.RUNPOD_API_KEY?.trim()) && Boolean(process.env.RUNPOD_POD_ID?.trim())
}

function enabled() {
  const override = booleanOverride('RUNPOD_LIFECYCLE_ENABLED')
  if (override !== null) return override
  return runpodLifecycleConfigured()
}

function config() {
  const apiKey = process.env.RUNPOD_API_KEY?.trim()
  const podId = process.env.RUNPOD_POD_ID?.trim()
  if (!apiKey || !podId) throw new Error('RUNPOD_API_KEY and RUNPOD_POD_ID are required when RunPod lifecycle is enabled')
  return { apiKey, podId }
}

async function graphql(query: string, variables: Record<string, unknown>) {
  const { apiKey } = config()
  const response = await fetch(`${RUNPOD_GRAPHQL_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`RunPod lifecycle HTTP ${response.status}`)
  const payload = await response.json() as { data?: unknown; errors?: Array<{ message?: string }> }
  if (payload.errors?.length) throw new Error(payload.errors.map(error => error.message || 'RunPod GraphQL error').join('; '))
  return payload.data
}

export function runpodLifecycleEnabled() {
  return enabled()
}

/**
 * Idle-stop is safe only when the matching wake-on-demand lifecycle is active and credentials are
 * present. With that safety contract satisfied, auto-stop defaults ON; an explicit false remains an
 * emergency/maintenance kill switch.
 */
export function runpodAutoStopEnabled(): boolean {
  if (!runpodLifecycleConfigured() || !runpodLifecycleEnabled()) return false
  return booleanOverride('COS_RUNPOD_AUTO_STOP_ENABLED') !== false
}

export async function ensureRunpodReasonerStarted(): Promise<{ attempted: boolean; started: boolean }> {
  if (!enabled()) return { attempted: false, started: false }
  const { podId } = config()
  await graphql(
    `mutation ResumeCosPod($input: PodResumeInput!) { podResume(input: $input) { id desiredStatus } }`,
    { input: { podId, gpuCount: 1 } },
  )
  return { attempted: true, started: true }
}

export async function stopRunpodReasoner(): Promise<{ attempted: boolean; stopped: boolean }> {
  if (!enabled()) return { attempted: false, stopped: false }
  const { podId } = config()
  await graphql(
    `mutation StopCosPod($input: PodStopInput!) { podStop(input: $input) { id desiredStatus } }`,
    { input: { podId } },
  )
  return { attempted: true, stopped: true }
}
