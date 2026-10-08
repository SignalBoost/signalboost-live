import assert from 'node:assert/strict'
import test from 'node:test'
import { assessPrivateDesignPartner, assessPhase5Cohort, type PartnerEvidence } from '../lib/ai/cos/labPhase5PartnerIntake.ts'

function partner(id: string): PartnerEvidence {
  return {
    partnerId: id, tenantId: `tenant-${id}`, privateByoi: true,
    signedEvaluationScopeRef: 'evidence:scope', signedPartnerAcceptanceRef: 'evidence:acceptance',
    teacherOutputRightsRef: 'evidence:teacher-rights', trainingDataRightsRef: 'evidence:data-rights',
    retentionDeletionTermsRef: 'evidence:retention', privacyReviewRef: 'evidence:privacy',
    tenantSecurityReviewRef: 'evidence:security', penetrationTestRef: 'evidence:pentest',
    recoveryDrillRef: 'evidence:recovery', auditLogReviewRef: 'evidence:audit',
    supportIncidentResponseRef: 'evidence:support', legalCommercialApprovalRef: 'evidence:legal',
    deploymentRollbackDecisionRef: 'evidence:rollback',
    phase3EvidenceApproved: true, phase4EvidenceApproved: true,
  }
}

test('complete private partner record is eligible only for independent review, not deployment', () => {
  const result = assessPrivateDesignPartner(partner('a'))
  assert.equal(result.readyForPrivateReview, true)
  assert.equal(result.authorizesProduction, false)
  assert.equal(result.authorizesMarketplace, false)
})
test('missing or bad rights evidence fails closed', () => {
  for (const change of [{ teacherOutputRightsRef: '' }, { trainingDataRightsRef: 'approved' }, { retentionDeletionTermsRef: '' }]) {
    assert.equal(assessPrivateDesignPartner({ ...partner('a'), ...change }).readyForPrivateReview, false)
  }
})
test('no previous phase signoff means no Phase 5 partner readiness', () => {
  assert.ok(assessPrivateDesignPartner({ ...partner('a'), phase4EvidenceApproved: false }).blockers.includes('phase4_acceptance_missing'))
})
test('private tenancy is required and duplicate/cross-tenant partners fail', () => {
  assert.equal(assessPrivateDesignPartner({ ...partner('a'), privateByoi: false }).readyForPrivateReview, false)
  assert.equal(assessPhase5Cohort([partner('a')]).eligibleForIndependentSignoff, false)
  assert.equal(assessPhase5Cohort([partner('a'), partner('a')]).eligibleForIndependentSignoff, false)
  assert.equal(assessPhase5Cohort([partner('a'), { ...partner('b'), tenantId: 'tenant-a' }]).eligibleForIndependentSignoff, false)
  assert.equal(assessPhase5Cohort([partner('a'), partner('b')]).eligibleForIndependentSignoff, true)
})
