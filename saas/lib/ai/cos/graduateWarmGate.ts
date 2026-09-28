// saas/lib/ai/cos/graduateWarmGate.ts
// WARM-ONLY GRADUATES IN LIVE CHAT (2026-09-27).
//
// University graduates are served from RunPod serverless endpoints scaled 0/1 (min 0 workers, max 1) — the owner's
// cost choice. With no warm worker, a request waits for a cold start (container + model load) that is far longer
// than the 8s live-chat budget. Production evidence (provider_inference_usage, 7 days): chat-path graduate attempts
// were 0/59 successful for "Reasoning & Decision Science:verifier" (p50 8,002ms, every one cut at the 8s budget), so
// each routed chat question paid ~8s and then the normal reasoner answered anyway.
//
// Rule: a live-chat request uses a RunPod-serverless graduate only when that endpoint already has a warm worker
// (RunPod /health: idle + running > 0). Cold endpoints are skipped instantly and the base reasoner answers. Background
// University, evaluation and specialist work is unaffected and still wakes the endpoint normally. The health read is
// bounded (1.5s) and cached briefly per endpoint so chat never pays it twice in a row; any error counts as "not warm".
import { configuredRunpodApiKey } from './runpodConfig.ts'

const SERVERLESS_API = 'https://api.runpod.ai/v2'
const RUNPOD_SERVERLESS_HOST = /^([a-z0-9]+)\.api\.runpod\.ai$/i
export const GRADUATE_WARM_CHECK_TIMEOUT_MS = 1_500
export const GRADUATE_WARM_CACHE_MS = 30_000

type WarmEntry = { warm: boolean; checkedAt: number }
const cache = new Map<string, WarmEntry>()

/** Endpoint id for an exact RunPod serverless OpenAI base URL (https://<id>.api.runpod.ai/v1), otherwise null. */
export function runpodServerlessEndpointIdFromBaseUrl(baseUrl: unknown): string | null {
  try {
    const url = new URL(String(baseUrl ?? '').trim())
    const match = RUNPOD_SERVERLESS_HOST.exec(url.hostname)
    if (!match || url.protocol !== 'https:') return null
    return match[1].toLowerCase()
  } catch {
    return null
  }
}

export async function runpodGraduateEndpointWarm(
  baseUrl: unknown,
  deps: { fetchImpl?: typeof fetch; apiKey?: string | null; now?: () => number } = {},
): Promise<boolean> {
  const endpointId = runpodServerlessEndpointIdFromBaseUrl(baseUrl)
  if (!endpointId) return true // Not a scale-to-zero RunPod endpoint: no cold-start rule applies.
  const now = deps.now ?? Date.now
  const cached = cache.get(endpointId)
  if (cached && now() - cached.checkedAt < GRADUATE_WARM_CACHE_MS) return cached.warm

  let warm = false
  try {
    const key = deps.apiKey === undefined ? configuredRunpodApiKey() : deps.apiKey
    if (key) {
      const response = await (deps.fetchImpl ?? fetch)(`${SERVERLESS_API}/${endpointId}/health`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(GRADUATE_WARM_CHECK_TIMEOUT_MS),
      })
      if (response.ok) {
        const payload = await response.json().catch(() => null) as { workers?: { idle?: unknown; running?: unknown } } | null
        const idle = Number(payload?.workers?.idle) || 0
        const running = Number(payload?.workers?.running) || 0
        warm = idle + running > 0
      }
    }
  } catch {
    warm = false
  }
  cache.set(endpointId, { warm, checkedAt: now() })
  return warm
}

/** Test seam. */
export function resetGraduateWarmCache(): void {
  cache.clear()
}
