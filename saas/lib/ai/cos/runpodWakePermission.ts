export type RunpodWakePermission = {
  allowed: boolean
  source: 'user_interactive' | 'background_or_untrusted'
  interactionId: string | null
  issuedAtMs: number | null
  ageMs: number | null
  reason: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function boundedMaxAgeMs(value?: number): number {
  if (Number.isFinite(value)) return Math.max(15_000, Math.min(5 * 60_000, Math.round(value as number)))
  const configured = Number(process.env.RUNPOD_INTERACTIVE_WAKE_MAX_AGE_MS || '120000')
  return Number.isFinite(configured) ? Math.max(15_000, Math.min(5 * 60_000, Math.round(configured))) : 120_000
}

function sameOrigin(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

/**
 * RunPod wake-on-demand is a COST boundary, not an authentication boundary.
 *
 * Existing SignalBoost browser chat already sends same-origin POSTs and does not auto-retry them.
 * Those same-origin browser turns are therefore eligible to wake a stopped Pod without requiring a
 * UI migration. Newer clients may also send an explicit interaction id/timestamp; when supplied,
 * that metadata is freshness-checked so a delayed replay cannot allocate GPU compute.
 *
 * Background jobs, cron routes, server-to-server probes, Supabase pg_net calls and old acceptance
 * tests do not carry browser Origin/Sec-Fetch-Site headers, so they fail closed at the wake gate.
 */
export function evaluateRunpodWakePermission(input: {
  body: any
  interactionHeader?: string | null
  requestOrigin?: string | null
  expectedOrigin?: string | null
  secFetchSite?: string | null
  nowMs?: number
  maxAgeMs?: number
}): RunpodWakePermission {
  const nowMs = input.nowMs ?? Date.now()
  const interaction = input.body?.context?.userInteraction
  const interactionId = typeof interaction?.id === 'string' && UUID_RE.test(interaction.id)
    ? interaction.id
    : null
  const issuedAtMs = Number.isFinite(Number(interaction?.issuedAtMs))
    ? Number(interaction.issuedAtMs)
    : null
  const ageMs = issuedAtMs === null ? null : nowMs - issuedAtMs
  const maxAgeMs = boundedMaxAgeMs(input.maxAgeMs)
  const originMatches = sameOrigin(input.requestOrigin, input.expectedOrigin)
  const site = String(input.secFetchSite || '').toLowerCase()
  const browserSameSite = site === 'same-origin' || site === 'same-site'

  if (!originMatches) {
    return { allowed: false, source: 'background_or_untrusted', interactionId, issuedAtMs, ageMs, reason: 'origin_mismatch_or_missing' }
  }
  if (!browserSameSite) {
    return { allowed: false, source: 'background_or_untrusted', interactionId, issuedAtMs, ageMs, reason: 'not_same_origin_browser_request' }
  }

  // Explicit metadata is optional for backward compatibility, but when a client supplies the marker
  // it must be complete and fresh. A malformed/stale marked request may not fall back to the legacy
  // same-origin allowance.
  if (input.interactionHeader === '1' || interactionId || issuedAtMs !== null) {
    if (input.interactionHeader !== '1' || !interactionId || issuedAtMs === null || ageMs === null) {
      return { allowed: false, source: 'background_or_untrusted', interactionId, issuedAtMs, ageMs, reason: 'incomplete_interaction_metadata' }
    }
    if (ageMs < -30_000) {
      return { allowed: false, source: 'background_or_untrusted', interactionId, issuedAtMs, ageMs, reason: 'interaction_timestamp_in_future' }
    }
    if (ageMs > maxAgeMs) {
      return { allowed: false, source: 'background_or_untrusted', interactionId, issuedAtMs, ageMs, reason: 'stale_interaction' }
    }
    return {
      allowed: true,
      source: 'user_interactive',
      interactionId,
      issuedAtMs,
      ageMs,
      reason: 'fresh_same_origin_user_interaction',
    }
  }

  return {
    allowed: true,
    source: 'user_interactive',
    interactionId: null,
    issuedAtMs: null,
    ageMs: null,
    reason: 'same_origin_browser_turn',
  }
}
