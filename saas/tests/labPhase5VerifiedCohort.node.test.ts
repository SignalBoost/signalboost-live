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
