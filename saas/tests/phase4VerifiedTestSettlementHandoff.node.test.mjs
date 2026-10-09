import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {stageVerifiedTestSettlement} from '../lib/billing/phase4VerifiedTestSettlementHandoff.mjs'
const now=1800000000, secret='whsec_test_secret_12345678'
const event={id:'evt_1234567890',livemode:false,type:'payment_intent.succeeded',data:{object:{id:'pi_1234567890'}}}
const rawBody=JSON.stringify(event)
const sig='t='+now+',v1='+createHmac('sha256',secret).update(now+'.'+rawBody).digest('hex')
const organizationId='12345678-1234-4234-8234-123456789abc',rateVersionId='12345678-1234-4234-8234-123456789abd'
const payment={id:'pi_1234567890',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd',
 metadata:{lab_organization_id:organizationId,purpose:'itmounts_lab_credits',price_version_id:rateVersionId}}
const api=async url=>({ok:true,json:async()=>url.endsWith('/v1/account')?{object:'account',id:'acct_1234567890'}:payment})
const base={trustedTestHost:true,organizationId,rateVersionId,tenantId:organizationId,
 approvedPrice:{currency:'usd',amountMinor:500,credits:50,rateVersionId},
 rawBody,signatureHeader:sig,webhookSecret:secret,nowSeconds:now,
 stripeSecretKey:'sk_test_fake12345678',stripeAccountId:'acct_1234567890',fetchImpl:api}
test('verified test evidence passes exact values to controlled executor only',async()=>{
 let called=0
 const result=await stageVerifiedTestSettlement({...base,executeTestSettlement:async args=>{
  called++;assert.equal(args.organizationId,organizationId)
  assert.equal(args.rateVersionId,rateVersionId)
  assert.equal(args.amountMinor,500)
  assert.equal(args.credits,50)
  assert.ok(Object.isFrozen(args))
  return {proof:true}
 }})
 assert.equal(called,1)
 assert.deepEqual(result,{proof:true})
})
test('missing trusted test host, mismatched tenant, rate and forged event never call executor',async()=>{
 for(const overrides of [
  {trustedTestHost:false},{tenantId:'another-tenant'},
  {rateVersionId:'12345678-1234-4234-8234-123456789abe'},
  {signatureHeader:'t='+now+',v1='+('0'.repeat(64))},
  {approvedPrice:{...base.approvedPrice,credits:0}},
  {stripeAccountId:'acct_attacker99999'}
 ]) {
  let called=0
  await assert.rejects(stageVerifiedTestSettlement({...base,...overrides,
   executeTestSettlement:async()=>{called++;return {}}}))
  assert.equal(called,0)
 }
})
test('reject callback-less request',async()=>{
 await assert.rejects(stageVerifiedTestSettlement({...base,executeTestSettlement:null}))
})
