import { createPublicKey } from 'node:crypto'
import { verifyPhase5SignedReview, type EvidenceReview, type TrustedReviewer } from './labPhase5SignedReview.ts'

export type Phase5ReviewerPolicy = Readonly<{
  keyId: string
  tenantId: string
  publicKeyPem: string
  notBefore: string
  expiresAt: string
  revoked: boolean
}>

/** Trusted policies must be supplied by the host, never by a partner manifest. */
export function verifyPhase5ReviewWithPolicy(
  review: EvidenceReview,
  manifest: Uint8Array,
  policies: readonly Phase5ReviewerPolicy[],
  observedAt: string,
) {
  const blockers: string[] = []
  const keys = policies.filter(p => p.keyId === review.reviewerKeyId)
  if (keys.length !== 1) blockers.push('reviewer_policy_missing_or_duplicated')
  const policy = keys.length === 1 ? keys[0] : undefined
  const now = Date.parse(observedAt)
  if (!Number.isFinite(now) || new Date(now).toISOString() !== observedAt) blockers.push('observation_time_invalid')
  if (policy) {
    if (policy.tenantId !== review.partner.tenantId) blockers.push('reviewer_tenant_mismatch')
    if (policy.revoked !== false) blockers.push('reviewer_revoked')
    const start = Date.parse(policy.notBefore)
    const end = Date.parse(policy.expiresAt)
    if (![start, end].every(Number.isFinite) || start >= end || now < start || now >= end) blockers.push('reviewer_outside_validity')
    try {
      if (createPublicKey(policy.publicKeyPem).asymmetricKeyType !== 'ed25519') blockers.push('reviewer_key_wrong_type')
    } catch { blockers.push('reviewer_key_invalid') }
  }
  const trusted: TrustedReviewer[] = blockers.length === 0 && policy ? [{ keyId: policy.keyId, publicKeyPem: policy.publicKeyPem }] : []
  const result = verifyPhase5SignedReview(review, trusted, manifest)
  blockers.push(...result.blockers)
  return Object.freeze({
    eligibleForIndependentSignoffReview: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
    authorizesProduction: false as const,
    authorizesMarketplace: false as const,
  })
}
