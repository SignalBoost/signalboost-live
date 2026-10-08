import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { phase5ReviewPayload, verifyPhase5SignedReview, type EvidenceReview } from '../lib/ai/cos/labPhase5SignedReview.ts'
import type { PartnerEvidence } from '../lib/ai/cos/labPhase5PartnerIntake.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const trusted = [{ keyId: 'reviewer-a', publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString() }]
const partner: PartnerEvidence = {
  partnerId: 'partner-a', tenantId: 'tenant-a', privateByoi: true,
  signedEvaluationScopeRef: 'ref:scope', signedPartnerAcceptanceRef: 'ref:acceptance',
  teacherOutputRightsRef: 'ref:teacher', trainingDataRightsRef: 'ref:data',
  retentionDeletionTermsRef: 'ref:retention', privacyReviewRef: 'ref:privacy',
  tenantSecurityReviewRef: 'ref:security', penetrationTestRef: 'ref:pentest',
  recoveryDrillRef: 'ref:drill', auditLogReviewRef: 'ref:audit',
  supportIncidentResponseRef: 'ref:response', legalCommercialApprovalRef: 'ref:legal',
  deploymentRollbackDecisionRef: 'ref:rollback',
  phase3EvidenceApproved: true, phase4EvidenceApproved: true,
}
function signed(p: PartnerEvidence = partner): EvidenceReview {
  const unsigned = { partner: p, manifestDigest: 'a'.repeat(64), reviewerKeyId: 'reviewer-a' }
  return { ...unsigned, signatureBase64: sign(null, phase5ReviewPayload(unsigned), privateKey).toString('base64') }
}
test('exact signed evidence review is eligible only for independent review', () => {
  const r = verifyPhase5SignedReview(signed(), trusted)
  assert.equal(r.eligibleForIndependentSignoffReview, true)
  assert.equal(r.authorizesProduction, false)
  assert.equal(r.authorizesMarketplace, false)
})
test('tampering with tenant identity or teacher rights fails signature verification', () => {
  for (const p of [{ ...partner, tenantId: 'tenant-b' }, { ...partner, teacherOutputRightsRef: 'ref:altered' }]) {
    const r = verifyPhase5SignedReview({ ...signed(), partner: p }, trusted)
    assert.equal(r.eligibleForIndependentSignoffReview, false)
    assert.ok(r.blockers.includes('review_signature_unverified'))
  }
})
test('unknown reviewer, changed digest, and missing evidence fail closed', () => {
  assert.equal(verifyPhase5SignedReview(signed(), []).eligibleForIndependentSignoffReview, false)
  assert.equal(verifyPhase5SignedReview({ ...signed(), manifestDigest: 'b'.repeat(64) }, trusted).eligibleForIndependentSignoffReview, false)
  assert.equal(verifyPhase5SignedReview(signed({ ...partner, trainingDataRightsRef: '' }), trusted).eligibleForIndependentSignoffReview, false)
  assert.equal(verifyPhase5SignedReview(signed(), [...trusted, ...trusted]).eligibleForIndependentSignoffReview, false)
})
