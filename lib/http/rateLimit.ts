// lib/http/rateLimit.ts
// Shared rate limiter for cost-bearing API routes.
//
// Two backends, chosen at runtime:
//   1) Upstash Redis (distributed, durable) when UPSTASH_REDIS_REST_URL and
//      UPSTASH_REDIS_REST_TOKEN are present in the environment. This is the
//      production path: limits are shared across every serverless instance and
//      survive cold starts, so a caller cannot dodge the limit by fanning
//      requests across instances.
//   2) In-memory per-instance fallback (the previous behavior) when Upstash is
//      not configured, or if an Upstash request fails. This keeps the route
//      working with a soft per-instance ceiling and means adding the limiter is
//      a no-op until the env vars are set.
//
// No SDK dependency — talks to Upstash's REST API over fetch. Runs on the Node
// runtime used by these routes.

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
}

// ── In-memory fallback ───────────────────────────────────────────────────────
const memHits = new Map<string, number[]>()

function memLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (memHits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  memHits.set(key, recent)
  if (memHits.size > 5000) {
    for (const [k, v] of memHits) {
      if (v.every((t) => now - t >= windowMs)) memHits.delete(k)
    }
  }
  return recent.length > max
}

// ── Upstash fixed-window ─────────────────────────────────────────────────────
// Bucketed key (key + window index) gives an O(1) fixed window: INCR the bucket,
// set its TTL once, compare to max. Returns the post-increment count, or null on
// any transport/parse error so the caller can fall back to the in-memory path.
async function upstashCount(
  url: string,
  token: string,
  bucketKey: string,
  windowMs: number,
): Promise<number | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // INCR returns the new count; PEXPIRE ... NX sets the TTL only on the first
      // hit of the window so the bucket self-expires and resets.
      body: JSON.stringify([
        ['INCR', bucketKey],
        ['PEXPIRE', bucketKey, String(windowMs), 'NX'],
      ]),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ result?: unknown; error?: unknown }>
    const count = Number(data?.[0]?.result)
    return Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

/**
 * Returns true if `key` has exceeded `max` requests in the current window.
 * Uses Upstash when configured, otherwise an in-memory per-instance counter.
 */
export async function rateLimited(key: string, opts: RateLimitOptions): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (url && token) {
    const bucket = Math.floor(Date.now() / opts.windowMs)
    const count = await upstashCount(url, token, `rl:${key}:${bucket}`, opts.windowMs)
    if (count !== null) return count > opts.max
    // Upstash unreachable → fall through to the local ceiling rather than
    // failing open entirely.
  }

  return memLimited(key, opts.max, opts.windowMs)
}
