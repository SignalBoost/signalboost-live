// Cost-control lifecycle for a dedicated RunPod COS reasoner.
// Disabled unless RUNPOD_LIFECYCLE_ENABLED=true. Secrets remain environment-only.

const RUNPOD_GRAPHQL_URL = 'https://api.runpod.io/graphql'

function enabled() {
  return process.env.RUNPOD_LIFECYCLE_ENABLED === 'true'
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
