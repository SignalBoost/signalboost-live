import { createHash } from 'node:crypto'
import type { EvidenceReview } from './labPhase5SignedReview.ts'
import { verifyPhase5ReviewWithPolicy, type Phase5ReviewerPolicy } from './labPhase5ReviewerPolicy.ts'

export type Phase5EvidenceDocument = Readonly<{
  ref: string
  sha256: string
  bytes: Uint8Array
  tenantId: string
}>
const REQUIRED = [
 'signedEvaluationScopeRef','signedPartnerAcceptanceRef','teacherOutputRightsRef',
 'trainingDataRightsRef','retentionDeletionTermsRef','privacyReviewRef',
 'tenantSecurityReviewRef','penetrationTestRef','recoveryDrillRef',
 'auditLogReviewRef','supportIncidentResponseRef','legalCommercialApprovalRef',
 'deploymentRollbackDecisionRef',
] as const

/** Reject missing, duplicated, cross-tenant and digest-mismatched documents.
 * Bytes are supplied from a trusted tenant-scoped document reader, not fetched from partner refs.
 * A matching digest does not prove a legal grant or document authenticity.
 */
export function verifyPhase5EvidenceBundle(input: Readonly<{
 review: EvidenceReview
 manifest: Uint8Array
 documents: readonly Phase5EvidenceDocument[]
 policies: readonly Phase5ReviewerPolicy[]
 observedAt: string
}>) {
 const signed = verifyPhase5ReviewWithPolicy(input.review,input.manifest,input.policies,input.observedAt)
 const blockers = [...signed.blockers]
 const tenant = input.review.partner.tenantId
 const expected = new Set(REQUIRED.map(k => input.review.partner[k]))
 for(const field of REQUIRED) {
  const ref=input.review.partner[field]
  const matches=input.documents.filter(doc => doc.ref===ref)
  if(matches.length!==1){blockers.push(`document_missing_or_duplicate:${field}`);continue}
  const doc=matches[0]
  if(doc.tenantId!==tenant) blockers.push(`document_tenant_mismatch:${field}`)
  if(!/^[a-f0-9]{64}$/.test(doc.sha256) || !(doc.bytes instanceof Uint8Array) ||
    doc.bytes.byteLength===0 || createHash('sha256').update(doc.bytes).digest('hex')!==doc.sha256)
    blockers.push(`document_digest_mismatch:${field}`)
 }
 if(input.documents.length!==REQUIRED.length || input.documents.some(doc=>!expected.has(doc.ref)))
  blockers.push('document_bundle_scope_mismatch')
 return Object.freeze({
  eligibleForIndependentLegalReview:blockers.length===0,
  blockers:Object.freeze([...new Set(blockers)]),
  authorizesProduction:false as const,
  authorizesMarketplace:false as const,
 })
}
