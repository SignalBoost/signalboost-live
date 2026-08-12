// saas/lib/hub/runpodTelemetry.ts
//
// RUNPOD IDLE-COST TELEMETRY AND STOP — the third and last item of the Aug 12 COS-
// infrastructure batch, closing the exact leak measured on Aug 11: $5.72 of a fresh
// $20 gone in ~13 hours on the A40 pod, at $0.45/hr, because nothing called the pod
// and nothing was watching the meter. This file adds the watching; the companion cron
// route adds the acting-on-it.
//
// FIELD NAMES, SOURCED NOT GUESSED. RunPod's GraphQL schema is not something this
// codebase can introspect at build time, and shipping a wrong field name silently
// (an API that returns null instead of erroring) is exactly the kind of unverified
// claim this whole engineering effort has spent the week eliminating. `costPerHr`,
// `desiredStatus`, and `runtime.uptimeInSeconds` are confirmed as of Aug 12 from
// RunPod's own published docs (docs.runpod.io/sdks/graphql/manage-pods) and their
// public Go SDK's Pod struct. The `podStop` mutation and its `{ id, desiredStatus }`
// response shape are confirmed directly from a docs.runpod.io worked example. If
// RunPod's schema changes, queryPodStatus fails LOUDLY (see below) rather than
// silently reporting a healthy pod that is actually gone.
//
// WHAT "IDLE" MEANS HERE. The pod itself has no concept of "nobody asked COS a
// question in the last hour" — that is an application-level fact, not something
// RunPod's API can report. Rather than build a new activity-tracking table, this
// reuses cos_ai_roi_metrics, which lib/ai/cos/cosFirstAnswer.ts (Aug 12) now writes
// on every real COS-first answer — including semantic-cache hits, since even a cache
// lookup calls the local embedding endpoint on the pod. The most recent row's
// created_at IS the most recent evidence the pod was actually used for anything.

const GRAPHQL_ENDPOINT = 'https://api.runpod.io/graphql'
const REQUEST_TIMEOUT_MS = 15_000

export type PodStatus = {
  id: string
  name: string
  /** True only for RUNNING. STOPPED, EXITED, and anything else all mean "not billing compute". */
  running: boolean
  desiredStatus: string
  /** USD per hour while running. Null when RunPod's response omits it — callers must fall back to RUNPOD_FALLBACK_HOURLY_RATE_USD, never assume 0. */
  costPerHr: number | null
  uptimeSeconds: number
}

export function runpodConfigured(): boolean {
  return Boolean(process.env.RUNPOD_API_KEY?.trim()) && Boolean(process.env.RUNPOD_POD_ID?.trim())
}

function fallbackHourlyRate(): number {
  const value = Number(process.env.RUNPOD_FALLBACK_HOURLY_RATE_USD || '0.45')
  return Number.isFinite(value) && value >= 0 ? value : 0.45
}

async function graphqlRequest<T>(query: string): Promise<T> {
  const apiKey = process.env.RUNPOD_API_KEY?.trim()
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
    if (!response.ok) {
      throw new Error(`RunPod GraphQL HTTP ${response.status}: ${await response.text()}`)
    }
    const body = await response.json() as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors?.length) {
      throw new Error(`RunPod GraphQL error: ${body.errors.map(e => e.message).join('; ')}`)
    }
    if (!body.data) {
      throw new Error('RunPod GraphQL response carried no data')
    }
    return body.data
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Status of the configured pod (RUNPOD_POD_ID). Throws on any failure — network,
 * auth, missing pod, or a schema mismatch — rather than returning a default "looks
 * fine" status. A telemetry function that fails silently is worse than no telemetry:
 * it produces false confidence that the pod is being watched.
 */
export async function queryPodStatus(): Promise<PodStatus> {
  const podId = process.env.RUNPOD_POD_ID?.trim()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')

  const data = await graphqlRequest<{
    myself?: { pods?: Array<{ id: string; name: string; desiredStatus?: string; costPerHr?: number | null; runtime?: { uptimeInSeconds?: number } | null }> }
  }>(`query { myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }`)

  const pod = data.myself?.pods?.find(p => p.id === podId)
  if (!pod) {
    throw new Error(`RunPod pod ${podId} was not found in this account's pod list — it may have been terminated (not merely stopped).`)
  }

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

/**
 * Stops the pod (releases the GPU, preserves /workspace — same distinction the
 * onboarding doc already draws between Stop and the destructive Terminate). Never
 * called automatically from this file; the cron route decides WHEN to call it and
 * is itself gated behind an explicit enable flag, matching every other autonomous
 * action in this codebase (COS_AUTONOMOUS_LEARNING_ENABLED, COS_LIVE_SOURCES_ENABLED).
 */
export async function stopPod(): Promise<{ id: string; desiredStatus: string }> {
  const podId = process.env.RUNPOD_POD_ID?.trim()
  if (!podId) throw new Error('RUNPOD_POD_ID is not configured')

  const data = await graphqlRequest<{ podStop?: { id: string; desiredStatus: string } }>(
    `mutation { podStop(input: { podId: "${podId}" }) { id desiredStatus } }`,
  )
  if (!data.podStop) throw new Error('RunPod podStop mutation returned no result')
  return data.podStop
}

/**
 * ESTIMATE, stated as such — the same honesty rule applied to the reasoner cost
 * savings on Aug 12 applies here in reverse. This is uptime × the pod's own reported
 * rate (or the configured fallback), not a RunPod invoice; RunPod's actual billing
 * may include per-second rounding or account-level effects this cannot see.
 */
export function estimateSessionCostUsd(status: PodStatus): number {
  const rate = status.costPerHr ?? fallbackHourlyRate()
  return (status.uptimeSeconds / 3600) * rate
}
