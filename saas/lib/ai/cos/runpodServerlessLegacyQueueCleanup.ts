import { configuredRunpodApiKey } from './runpodConfig.ts'
import { runpodServerlessEndpointHealth } from './runpodServerlessDistilledProvision.ts'

const SERVERLESS_API = 'https://api.runpod.ai/v2'
const REQUEST_TIMEOUT_MS = 15_000

function cleanEndpointId(value: unknown): string {
  const id = String(value ?? '').trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error('RunPod endpoint id is invalid')
  return id
}

function safeCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

/**
 * Remove only queued jobs from a legacy RunPod Serverless queue endpoint. RunPod's purge-queue
 * operation does not cancel in-progress work. The caller remains responsible for proving this is a
 * superseded endpoint; this helper accepts no model/runtime mutation authority.
 */
export async function purgeRunpodServerlessLegacyQueue(endpointIdInput: string) {
  const endpointId = cleanEndpointId(endpointIdInput)
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')

  const before = await runpodServerlessEndpointHealth(endpointId)
  const queuedBefore = before.ok ? safeCount(before.jobs.inQueue) : 0
  if (!before.ok) {
    throw new Error(`legacy_queue_health_unavailable:${before.error || before.httpStatus || 'unknown'}`)
  }
  if (queuedBefore < 1) {
    return Object.freeze({ endpointId, purged: false as const, reason: 'queue_already_empty', before, after: before })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${SERVERLESS_API}/${endpointId}/purge-queue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`RunPod purge queue HTTP ${response.status}`)
    let providerResult: Record<string, unknown> | null = null
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) providerResult = parsed as Record<string, unknown>
      } catch {
        providerResult = null
      }
    }
    const after = await runpodServerlessEndpointHealth(endpointId)
    if (!after.ok) throw new Error(`legacy_queue_post_purge_health_unavailable:${after.error || after.httpStatus || 'unknown'}`)
    return Object.freeze({
      endpointId,
      purged: true as const,
      queuedBefore,
      queuedAfter: safeCount(after.jobs.inQueue),
      before,
      after,
      providerAcknowledged: Boolean(providerResult),
    })
  } finally {
    clearTimeout(timer)
  }
}
