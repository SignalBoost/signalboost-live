import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac,createHash} from 'node:crypto'
import {buildVerifiedTestSettlementEnvelope} from '../lib/billing/phase4VerifiedTestSettlementEnvelope.mjs'
const now=1800000000,secret='whsec_synthetic_secret_12345678'
const event={id:'evt_1234567890',livemode:false,type:'payment_intent.succeeded',data:{object:{id:'pi_1234567890'}}}
const rawBody=JSON.stringify(event)
const signed=body=>'t='+now+',v1='+createHmac('sha256',secret).update(now+'.'+body).digest('hex')
const intent={id:'pi_1234567890',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd',
 metadata:{lab_organization_id:'tenant-a',purpose:'itmounts_lab_credits',price_version_id:'rate-1'}}
const base={rawBody,signatureHeader:signed(rawBody),webhookSecret:secret,nowSeconds:now,
 stripeSecretKey:'sk_test_fake12345678',tenantId:'tenant-a',stripeAccountId:'acct_1234567890',
 approvedPrice:{currency:'usd',amountMinor:500,credits:50,rateVersionId:'rate-1'}}
test('signed event plus independent payment produces frozen non-settling test envelope',async()=>{
 const value=await buildVerifiedTestSettlementEnvelope({...base,fetchImpl:async()=>({ok:true,json:async()=>intent})})
 assert.equal(value.kind,'test_only_unsettled_evidence')
 assert.equal(value.stripeLivemode,false)
 assert.equal(value.credits,50)
 assert.equal(value.payloadSha256,createHash('sha256').update(rawBody).digest('hex'))
 assert.ok(Object.isFrozen(value))
 assert.equal('settled' in value,false)
})
test('forged signature must not request Stripe payment',async()=>{
 let requests=0
 await assert.rejects(buildVerifiedTestSettlementEnvelope({...base,signatureHeader:'t='+now+',v1='+('0'.repeat(64)),
 fetchImpl:async()=>{requests++;return {ok:true,json:async()=>intent}}}))
 assert.equal(requests,0)
})
test('pinned Stripe account and approved tenant/amount cannot be bypassed',async()=>{
 for(const patch of [
 {stripeAccountId:'not-an-account'},
 {tenantId:'tenant-b'},
 {approvedPrice:{...base.approvedPrice,amountMinor:100}},
 {stripeSecretKey:'sk_live_fake12345678'}
 ]) await assert.rejects(buildVerifiedTestSettlementEnvelope({...base,...patch,fetchImpl:async()=>({ok:true,json:async()=>intent})}))
})
test('Stripe API errors fail closed; no envelope is emitted',async()=>{
 await assert.rejects(buildVerifiedTestSettlementEnvelope({...base,fetchImpl:async()=>{throw Error('network')}}))
})
