/** Phase 5 private partner intake decision. Advisory only: never grants runtime or spend authority. */
export type PartnerEvidence = Readonly<{
  partnerId: string
  tenantId: string
  privateByoi: boolean
  signedEvaluationScopeRef: string
  signedPartnerAcceptanceRef: string
  teacherOutputRightsRef: string
  trainingDataRightsRef: string
  retentionDeletionTermsRef: string
  privacyReviewRef: string
  tenantSecurityReviewRef: string
  penetrationTestRef: string
  recoveryDrillRef: string
  auditLogReviewRef: string
  supportIncidentResponseRef: string
  legalCommercialApprovalRef: string
  deploymentRollbackDecisionRef: string
  phase3EvidenceApproved: boolean
  phase4EvidenceApproved: boolean
}>

const REQUIRED_REFERENCES = [
  'signedEvaluationScopeRef', 'signedPartnerAcceptanceRef', 'teacherOutputRightsRef',
  'trainingDataRightsRef', 'retentionDeletionTermsRef', 'privacyReviewRef',
  'tenantSecurityReviewRef', 'penetrationTestRef', 'recoveryDrillRef',
  'auditLogReviewRef', 'supportIncidentResponseRef', 'legalCommercialApprovalRef',
  'deploymentRollbackDecisionRef',
] as const

const REF = /^[a-z][a-z0-9+.-]*:[^\s]+$/i

/** References are locators, not proof of authenticity; reviewers must independently validate them. */
export function assessPrivateDesignPartner(input: Partial<PartnerEvidence>): Readonly<{
  readyForPrivateReview: boolean
  blockers: readonly string[]
  authorizesProduction: false
  authorizesMarketplace: false
}> {
  const blockers: string[] = []
  if (!String(input.partnerId ?? '').trim()) blockers.push('partner_identity_missing')
  if (!String(input.tenantId ?? '').trim()) blockers.push('tenant_identity_missing')
  if (input.privateByoi !== true) blockers.push('private_byoi_required')
  for (const key of REQUIRED_REFERENCES) {
    if (!REF.test(String(input[key] ?? '').trim())) blockers.push(`${key}_missing_or_invalid`)
  }
  if (input.phase3EvidenceApproved !== true) blockers.push('phase3_acceptance_missing')
  if (input.phase4EvidenceApproved !== true) blockers.push('phase4_acceptance_missing')
  return Object.freeze({
    readyForPrivateReview: blockers.length === 0,
    blockers: Object.freeze(blockers),
    authorizesProduction: false,
    authorizesMarketplace: false,
  })
}

/** Phase 5 requires independent acceptance of at least two distinct enterprise tenants. */
export function assessPhase5Cohort(partners: readonly PartnerEvidence[]): Readonly<{ eligibleForIndependentSignoff: boolean; blockers: readonly string[] }> {
  const blockers: string[] = []
  if (partners.length < 2 || partners.length > 3) blockers.push('design_partner_count_must_be_2_or_3')
  if (new Set(partners.map(p => p.partnerId)).size !== partners.length) blockers.push('duplicate_partner_identity')
  if (new Set(partners.map(p => p.tenantId)).size !== partners.length) blockers.push('partner_tenant_isolation_not_demonstrated')
  for (const [index, partner] of partners.entries()) {
    for (const blocker of assessPrivateDesignPartner(partner).blockers) blockers.push(`partner_${index}:${blocker}`)
  }
  return Object.freeze({ eligibleForIndependentSignoff: blockers.length === 0, blockers: Object.freeze(blockers) })
}
