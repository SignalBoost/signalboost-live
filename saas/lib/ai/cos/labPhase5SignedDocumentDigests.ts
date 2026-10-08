import type { EvidenceReview } from './labPhase5SignedReview.ts'
import { verifyPhase5EvidenceBundle, type Phase5EvidenceDocument } from './labPhase5EvidenceBundle.ts'
import type { Phase5ReviewerPolicy } from './labPhase5ReviewerPolicy.ts'

const FIELDS = [
 'signedEvaluationScopeRef','signedPartnerAcceptanceRef','teacherOutputRightsRef',
 'trainingDataRightsRef','retentionDeletionTermsRef','privacyReviewRef',
 'tenantSecurityReviewRef','penetrationTestRef','recoveryDrillRef',
 'auditLogReviewRef','supportIncidentResponseRef','legalCommercialApprovalRef',
 'deploymentRollbackDecisionRef',
] as const

/** The manifest digest is already bound by the Ed25519 reviewer signature.
 * This stricter check also binds every document's SHA256 to that signed manifest.
 * It does not independently grant legal rights or production authority.
 */
export function verifyPhase5SignedDocumentDigests(input: Readonly<{
 review: EvidenceReview
 manifest: Uint8Array
 documents: readonly Phase5EvidenceDocument[]
 policies: readonly Phase5ReviewerPolicy[]
 observedAt: string
}>) {
 const base = verifyPhase5EvidenceBundle(input)
 const blockers = [...base.blockers]
 let payload: unknown
 try {
  if (input.manifest.byteLength > 65536) throw Error('oversized')
  payload = JSON.parse(Buffer.from(input.manifest).toString('utf8'))
 } catch { blockers.push('signed_document_manifest_invalid') }
 if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  blockers.push('signed_document_manifest_invalid')
 } else {
  const m = payload as Record<string, unknown>
  if (m.contract !== 'itmounts-phase5-evidence-digests-v1' || m.tenantId !== input.review.partner.tenantId ||
      !Array.isArray(m.documents) || m.documents.length !== FIELDS.length)
   blockers.push('signed_document_manifest_scope_mismatch')
  else {
   const fields = new Set<string>()
   for (const record of m.documents) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
     blockers.push('signed_document_entry_invalid'); continue
    }
    const entry = record as Record<string, unknown>
    if (typeof entry.field !== 'string' || !FIELDS.some(f=>f===entry.field) || fields.has(entry.field)) {
     blockers.push('signed_document_entry_invalid'); continue
    }
    fields.add(entry.field)
    const field = entry.field as typeof FIELDS[number]
    const matches = input.documents.filter(d=>d.ref===input.review.partner[field])
    if (entry.ref !== input.review.partner[field] || matches.length!==1 ||
        entry.sha256 !== matches[0].sha256 ||
        !/^[a-f0-9]{64}$/.test(String(entry.sha256)))
     blockers.push('signed_document_digest_mismatch:'+field)
   }
   if (fields.size !== FIELDS.length) blockers.push('signed_document_manifest_incomplete')
  }
 }
 return Object.freeze({
  eligibleForIndependentLegalReview:blockers.length===0,
  blockers:Object.freeze([...new Set(blockers)]),
  authorizesProduction:false as const,
  authorizesMarketplace:false as const,
 })
}
