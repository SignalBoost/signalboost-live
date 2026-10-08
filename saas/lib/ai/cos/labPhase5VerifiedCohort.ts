import { assessPhase5Cohort } from './labPhase5PartnerIntake.ts'
import { verifyPhase5SignedDocumentDigests } from './labPhase5SignedDocumentDigests.ts'
import type { EvidenceReview } from './labPhase5SignedReview.ts'
import type { Phase5EvidenceDocument } from './labPhase5EvidenceBundle.ts'
import type { Phase5ReviewerPolicy } from './labPhase5ReviewerPolicy.ts'

export type Phase5PartnerBundle = Readonly<{
 review: EvidenceReview
 manifest: Uint8Array
 documents: readonly Phase5EvidenceDocument[]
 policies: readonly Phase5ReviewerPolicy[]
 observedAt: string
}>

/** Combines signed per-document evidence for 2–3 distinct private design partners.
 * Advisory only: independent legal, security and partner acceptance remain mandatory.
 */
export function verifyPhase5PrivateCohort(bundles: readonly Phase5PartnerBundle[]) {
 const blockers: string[] = []
 const partners = bundles.map(b => b.review.partner)
 blockers.push(...assessPhase5Cohort(partners).blockers)
 const allRefs = new Set<string>()
 const allReviewerKeys = new Set<string>()
 for (const [index,bundle] of bundles.entries()) {
  const result = verifyPhase5SignedDocumentDigests(bundle)
  for (const blocker of result.blockers) blockers.push(`partner_${index}:${blocker}`)
  const reviewerScope = bundle.review.partner.tenantId + ':' + bundle.review.reviewerKeyId
  if (allReviewerKeys.has(reviewerScope)) blockers.push(`partner_${index}:reviewer_scope_reused`)
  allReviewerKeys.add(reviewerScope)
  for (const document of bundle.documents) {
   if (allRefs.has(document.ref)) blockers.push(`partner_${index}:evidence_ref_reused_across_partners`)
   allRefs.add(document.ref)
  }
 }
 return Object.freeze({
  eligibleForIndependentCohortSignoff:blockers.length===0,
  blockers:Object.freeze([...new Set(blockers)]),
  authorizesProduction:false as const,
  authorizesMarketplace:false as const,
  certified:false as const,
 })
}
