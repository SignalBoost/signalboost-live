import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { phase5ReviewPayload } from '../lib/ai/cos/labPhase5SignedReview.ts'
import { verifyPhase5ReviewWithPolicy } from '../lib/ai/cos/labPhase5ReviewerPolicy.ts'
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const manifest = Buffer.from('synthetic-manifest')
const partner = {
 partnerId:'a',tenantId:'tenant-a',privateByoi:true,
 signedEvaluationScopeRef:'ref:scope',signedPartnerAcceptanceRef:'ref:acceptance',
 teacherOutputRightsRef:'ref:teacher',trainingDataRightsRef:'ref:data',
 retentionDeletionTermsRef:'ref:retention',privacyReviewRef:'ref:privacy',
 tenantSecurityReviewRef:'ref:security',penetrationTestRef:'ref:pentest',
 recoveryDrillRef:'ref:recovery',auditLogReviewRef:'ref:audit',
 supportIncidentResponseRef:'ref:support',legalCommercialApprovalRef:'ref:legal',
 deploymentRollbackDecisionRef:'ref:rollback',phase3EvidenceApproved:true,phase4EvidenceApproved:true,
}
const unsigned = {partner,manifestDigest:createHash('sha256').update(manifest).digest('hex'),reviewerKeyId:'reviewer-a'}
const review = {...unsigned,signatureBase64:sign(null,phase5ReviewPayload(unsigned),privateKey).toString('base64')}
const policy = {keyId:'reviewer-a',tenantId:'tenant-a',publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',revoked:false}
const now='2026-10-08T12:00:00.000Z'
test('valid review remains advisory only',()=>{
 const result=verifyPhase5ReviewWithPolicy(review,manifest,[policy],now)
 assert.equal(result.eligibleForIndependentSignoffReview,true, result.blockers.join(', '))
 assert.equal(result.authorizesProduction,false)
})
test('unknown, duplicate, revoked, wrong-tenant, expired policies fail closed',()=>{
 for (const policies of [[],[policy,policy],[{...policy,revoked:true}],[{...policy,tenantId:'other'}],[{...policy,expiresAt:'2026-01-01T00:00:00.000Z'}]]) {
  assert.equal(verifyPhase5ReviewWithPolicy(review,manifest,policies,now).eligibleForIndependentSignoffReview,false)
 }
})
test('manifest tampering and missing clock fail closed',()=>{
 assert.equal(verifyPhase5ReviewWithPolicy(review,Buffer.from('altered'),[policy],now).eligibleForIndependentSignoffReview,false)
 assert.equal(verifyPhase5ReviewWithPolicy(review,manifest,[policy],'no-clock').eligibleForIndependentSignoffReview,false)
})

test('UTC policy windows reject malformed, rollover, offset and noncanonical timestamps',()=>{
 for (const bad of ['2026-02-30T00:00:00.000Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00.000+00:00','not-a-date']) {
  assert.equal(verifyPhase5ReviewWithPolicy(review,manifest,[{...policy,notBefore:bad}],now).eligibleForIndependentSignoffReview,false)
 }
 assert.equal(verifyPhase5ReviewWithPolicy(review,manifest,[policy],'2026-10-08T12:00:00Z').eligibleForIndependentSignoffReview,false)
 assert.equal(verifyPhase5ReviewWithPolicy(review,manifest,[policy],policy.expiresAt).eligibleForIndependentSignoffReview,false)
})
