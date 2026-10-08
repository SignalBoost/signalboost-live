import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { assessPrivateDesignPartner, type PartnerEvidence } from './labPhase5PartnerIntake.ts'

/** A signed review attests to one immutable evidence manifest; it is not proof of the documents' legal validity. */
export type EvidenceReview = Readonly<{
  partner: PartnerEvidence
  manifestDigest: string
  reviewerKeyId: string
  signatureBase64: string
}>
export type TrustedReviewer = Readonly<{ keyId: string; publicKeyPem: string }>
const SHA256 = /^[a-f0-9]{64}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Stable explicit ordering prevents signature ambiguity and accidental fields granting authority. */
export function phase5ReviewPayload(review: Pick<EvidenceReview, 'partner' | 'manifestDigest' | 'reviewerKeyId'>): Buffer {
  const p = review.partner
  return Buffer.from(JSON.stringify({
    contract: 'itmounts-lab-phase5-private-review-v1',
    partnerId: p.partnerId, tenantId: p.tenantId,
    manifestDigest: review.manifestDigest,
    reviewerKeyId: review.reviewerKeyId,
    evidence: {
      signedEvaluationScopeRef: p.signedEvaluationScopeRef,
      signedPartnerAcceptanceRef: p.signedPartnerAcceptanceRef,
      teacherOutputRightsRef: p.teacherOutputRightsRef,
      trainingDataRightsRef: p.trainingDataRightsRef,
      retentionDeletionTermsRef: p.retentionDeletionTermsRef,
      privacyReviewRef: p.privacyReviewRef,
      tenantSecurityReviewRef: p.tenantSecurityReviewRef,
      penetrationTestRef: p.penetrationTestRef,
      recoveryDrillRef: p.recoveryDrillRef,
      auditLogReviewRef: p.auditLogReviewRef,
      supportIncidentResponseRef: p.supportIncidentResponseRef,
      legalCommercialApprovalRef: p.legalCommercialApprovalRef,
      deploymentRollbackDecisionRef: p.deploymentRollbackDecisionRef,
    },
    privateByoi: p.privateByoi,
    phase3EvidenceApproved: p.phase3EvidenceApproved,
    phase4EvidenceApproved: p.phase4EvidenceApproved,
  }), 'utf8')
}

export function verifyPhase5SignedReview(review: EvidenceReview, trustedReviewers: readonly TrustedReviewer[]): Readonly<{
  eligibleForIndependentSignoffReview: boolean
  blockers: readonly string[]
  authorizesProduction: false
  authorizesMarketplace: false
}> {
  const blockers = [...assessPrivateDesignPartner(review.partner).blockers]
  if (!SHA256.test(review.manifestDigest)) blockers.push('manifest_digest_invalid')
  const matches = trustedReviewers.filter(k => k.keyId === review.reviewerKeyId)
  if (matches.length !== 1) blockers.push('trusted_reviewer_key_missing_or_ambiguous')
  if (!BASE64.test(review.signatureBase64) || review.signatureBase64.length !== 88) blockers.push('review_signature_invalid')
  if (!blockers.length) {
    let verified = false
    try {
      const key: KeyObject = createPublicKey(matches[0].publicKeyPem)
      verified = key.asymmetricKeyType === 'ed25519' &&
        verify(null, phase5ReviewPayload(review), key, Buffer.from(review.signatureBase64, 'base64'))
    } catch { verified = false }
    if (!verified) blockers.push('review_signature_unverified')
  }
  return Object.freeze({
    eligibleForIndependentSignoffReview: blockers.length === 0,
    blockers: Object.freeze(blockers),
    authorizesProduction: false,
    authorizesMarketplace: false,
  })
}
