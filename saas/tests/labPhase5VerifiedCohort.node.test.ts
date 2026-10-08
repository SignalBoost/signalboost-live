import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPhase5PrivateCohort } from '../lib/ai/cos/labPhase5VerifiedCohort.ts'

test('no actual enterprise partners cannot certify Phase 5',()=>{
 const result=verifyPhase5PrivateCohort([])
 assert.equal(result.eligibleForIndependentCohortSignoff,false)
 assert.ok(result.blockers.includes('design_partner_count_must_be_2_or_3'))
 assert.equal(result.certified,false)
 assert.equal(result.authorizesProduction,false)
 assert.equal(result.authorizesMarketplace,false)
})
test('an unverified partner cannot pass as a cohort',()=>{
 const partial = {partnerId:'candidate',tenantId:'tenant-1'} as never
 const bundle = {review:{partner:partial,reviewerKeyId:'',signatureBase64:'',manifestDigest:''},manifest:new Uint8Array(),documents:[],policies:[],observedAt:'2026-10-08T12:00:00.000Z'} as never
 const result=verifyPhase5PrivateCohort([bundle])
 assert.equal(result.eligibleForIndependentCohortSignoff,false)
 assert.ok(result.blockers.some(b=>b.includes('partner_0:')))
})

test('two complete signed tenants pass advisory review; cross-partner replacement fails',async()=>{
 const {createHash,generateKeyPairSync,sign}=await import('node:crypto')
 const {phase5ReviewPayload}=await import('../lib/ai/cos/labPhase5SignedReview.ts')
 const fields=['signedEvaluationScopeRef','signedPartnerAcceptanceRef','teacherOutputRightsRef','trainingDataRightsRef','retentionDeletionTermsRef','privacyReviewRef','tenantSecurityReviewRef','penetrationTestRef','recoveryDrillRef','auditLogReviewRef','supportIncidentResponseRef','legalCommercialApprovalRef','deploymentRollbackDecisionRef'] as const
 const build=(tenantId:string)=>{
  const keys=generateKeyPairSync('ed25519')
  const refs=Object.fromEntries(fields.map(f=>[f,'doc:'+tenantId+':'+f]))
  const partner={partnerId:'partner-'+tenantId,tenantId,privateByoi:true,phase3EvidenceApproved:true,phase4EvidenceApproved:true,...refs}
  const documents=fields.map(field=>{const bytes=Buffer.from(tenantId+':'+field);return{ref:partner[field],tenantId,bytes,sha256:createHash('sha256').update(bytes).digest('hex')}})
  const manifest=Buffer.from(JSON.stringify({contract:'itmounts-phase5-evidence-digests-v1',tenantId,documents:fields.map((field,i)=>({field,ref:partner[field],sha256:documents[i].sha256}))}))
  const unsigned={partner,manifestDigest:createHash('sha256').update(manifest).digest('hex'),reviewerKeyId:'reviewer-'+tenantId}
  const review={...unsigned,signatureBase64:sign(null,phase5ReviewPayload(unsigned),keys.privateKey).toString('base64')}
  const policies=[{keyId:unsigned.reviewerKeyId,tenantId,publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',revoked:false}]
  return {review,manifest,documents,policies,observedAt:'2026-10-08T12:00:00.000Z'}
 }
 const a=build('tenant-a'),b=build('tenant-b')
 const valid=verifyPhase5PrivateCohort([a,b])
 assert.equal(valid.eligibleForIndependentCohortSignoff,true,valid.blockers.join(','))
 assert.equal(valid.certified,false)
 assert.equal(valid.authorizesProduction,false)
 assert.equal(valid.authorizesMarketplace,false)
 const swapped=verifyPhase5PrivateCohort([a,{...b,documents:[a.documents[0],...b.documents.slice(1)]}])
 assert.equal(swapped.eligibleForIndependentCohortSignoff,false)
 const duplicate=verifyPhase5PrivateCohort([a,a])
 assert.equal(duplicate.eligibleForIndependentCohortSignoff,false)
})
