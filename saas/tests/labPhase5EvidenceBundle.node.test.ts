import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { verifyPhase5EvidenceBundle } from '../lib/ai/cos/labPhase5EvidenceBundle.ts'
import { phase5ReviewPayload } from '../lib/ai/cos/labPhase5SignedReview.ts'
const keys=generateKeyPairSync('ed25519')
const manifest=Buffer.from('test-phase5-manifest')
const partner={
 partnerId:'a',tenantId:'tenant-a',privateByoi:true,
 signedEvaluationScopeRef:'ref:scope',signedPartnerAcceptanceRef:'ref:acceptance',
 teacherOutputRightsRef:'ref:teacher',trainingDataRightsRef:'ref:data',
 retentionDeletionTermsRef:'ref:retention',privacyReviewRef:'ref:privacy',
 tenantSecurityReviewRef:'ref:security',penetrationTestRef:'ref:pentest',
 recoveryDrillRef:'ref:recovery',auditLogReviewRef:'ref:audit',
 supportIncidentResponseRef:'ref:support',legalCommercialApprovalRef:'ref:legal',
 deploymentRollbackDecisionRef:'ref:rollback',phase3EvidenceApproved:true,phase4EvidenceApproved:true,
}
const unsigned={partner,manifestDigest:createHash('sha256').update(manifest).digest('hex'),reviewerKeyId:'reviewer-a'}
const review={...unsigned,signatureBase64:sign(null,phase5ReviewPayload(unsigned),keys.privateKey).toString('base64')}
const policies=[{keyId:'reviewer-a',tenantId:'tenant-a',publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',revoked:false}]
const observedAt='2026-10-08T12:00:00.000Z'
const refs=[
 partner.signedEvaluationScopeRef,partner.signedPartnerAcceptanceRef,
 partner.teacherOutputRightsRef,partner.trainingDataRightsRef,
 partner.retentionDeletionTermsRef,partner.privacyReviewRef,
 partner.tenantSecurityReviewRef,partner.penetrationTestRef,
 partner.recoveryDrillRef,partner.auditLogReviewRef,
 partner.supportIncidentResponseRef,partner.legalCommercialApprovalRef,
 partner.deploymentRollbackDecisionRef,
]
const documents=refs.map(ref=>{
 const bytes=Buffer.from('evidence:'+ref)
 return {ref,tenantId:'tenant-a',bytes,sha256:createHash('sha256').update(bytes).digest('hex')}
})
const verify=(docs:typeof documents)=>
 verifyPhase5EvidenceBundle({review,manifest,policies,observedAt,documents:docs})
test('valid tenant-scoped hash-matched evidence stays advisory, never authorizes production',()=>{
 const result=verify(documents)
 assert.equal(result.eligibleForIndependentLegalReview,true)
 assert.equal(result.authorizesProduction,false)
 assert.equal(result.authorizesMarketplace,false)
})
test('missing and duplicate evidence fail closed',()=>{
 assert.equal(verify(documents.slice(1)).eligibleForIndependentLegalReview,false)
 assert.equal(verify([...documents,documents[0]]).eligibleForIndependentLegalReview,false)
})
test('cross-tenant evidence and tampered hashes are rejected',()=>{
 assert.equal(verify([{...documents[0],tenantId:'tenant-b'},...documents.slice(1)]).eligibleForIndependentLegalReview,false)
 assert.equal(verify([{...documents[0],bytes:Buffer.from('tampered')},...documents.slice(1)]).eligibleForIndependentLegalReview,false)
})
test('unexpected evidence outside the signed review bundle is rejected',()=>{
 const bytes=Buffer.from('extra')
 assert.equal(verify([...documents,{ref:'ref:extra',tenantId:'tenant-a',bytes,sha256:createHash('sha256').update(bytes).digest('hex')}]).eligibleForIndependentLegalReview,false)
})
