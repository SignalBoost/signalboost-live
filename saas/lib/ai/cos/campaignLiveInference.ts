// saas/lib/ai/cos/campaignLiveInference.ts
//
// The verification campaign measures LIVE inference (campaign rule 2): its analysis requests must be answered by a
// model call, never replayed from the answer cache (gap analysis Q19). The campaign reaches production over the public
// endpoint, so it proves itself with a short-lived signed header. The header can only turn the cache off for that one
// request: it grants no access, no privilege and no other behaviour, so a leaked token costs at most extra inference.
// It reuses the server's existing provenance signing secret (no new configuration).

import { createHmac, timingSafeEqual } from 'node:crypto'
import { provenanceBoundarySecret } from './provenanceBoundarySecret.ts'

export const CAMPAIGN_LIVE_INFERENCE_HEADER = 'x-itmounts-campaign-live-inference'

/** A token is accepted for this long after it was issued: one campaign request, with clock skew. */
const TOKEN_LIFETIME_MS = 10 * 60_000
const PURPOSE = 'itmounts-campaign-live-inference:v1'

function signature(secret: string, issuedAt: number): string {
  return createHmac('sha256', secret).update(`${PURPOSE}:${issuedAt}`).digest('hex')
}

/** The header value for a campaign request issued now; null when the server has no signing secret. */
export function campaignLiveInferenceToken(now = Date.now(), secret = provenanceBoundarySecret()): string | null {
  if (!secret) return null
  return `${now}.${signature(secret, now)}`
}

/** True only for a correctly signed, unexpired campaign token. */
export function campaignLiveInferenceRequested(headerValue: string | null | undefined, now = Date.now(), secret = provenanceBoundarySecret()): boolean {
  if (!secret || !headerValue) return false
  const match = /^(\d{13})\.([0-9a-f]{64})$/.exec(headerValue.trim())
  if (!match) return false
  const issuedAt = Number(match[1])
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > TOKEN_LIFETIME_MS) return false
  const expected = Buffer.from(signature(secret, issuedAt), 'hex')
  const given = Buffer.from(match[2], 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}


/**
 * Verification-only read-back of an existing reasoner turn ID.
 * The public answer capsule deliberately excludes internal identifiers. Never
 * manufacture a correlation ID: an absent real turn remains untraceable.
 */
export function signedCampaignTurnId(
  provenance: unknown,
  headerValue: string | null | undefined,
  now = Date.now(),
  secret = provenanceBoundarySecret(),
): string | null {
  if (!campaignLiveInferenceRequested(headerValue, now, secret)) return null
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null
  const value = (provenance as Record<string, unknown>).turnId
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim()
    : null
}
