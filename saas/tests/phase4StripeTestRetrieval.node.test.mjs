import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyRetrievedStripeTestPayment} from '../lib/billing/phase4StripeTestRetrieval.mjs'
const event={id:'evt_1234567890',livemode:false,type:'payment_intent.succeeded',data:{object:{id:'pi_1234567890'}}}
const payment={id:'pi_1234567890',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd',metadata:{lab_organization_id:'tenant-a',purpose:'itmounts_lab_credits',price_version_id:'rate-1'}}
const approvedPrice={currency:'usd',amountMinor:500,credits:50,rateVersionId:'rate-1'}
const base={event,tenantId:'tenant-a',approvedPrice,stripeSecretKey:'sk_test_fake12345678'}
test('trusted Stripe server retrieval binds exact request and validated proof',async()=>{
 let called=0
 const proof=await verifyRetrievedStripeTestPayment({...base,fetchImpl:async(url,options)=>{
  called++
  assert.equal(url,'https://api.stripe.com/v1/payment_intents/pi_1234567890')
  assert.equal(options.method,'GET')
  assert.equal(options.redirect,'error')
  assert.equal(options.cache,'no-store')
  return {ok:true,json:async()=>payment}
 }})
 assert.equal(called,1)
 assert.equal(proof.credits,50)
})
test('reject live secret, missing transport and unsupported payment identifiers without requests',async()=>{
 for(const p of [{stripeSecretKey:'sk_live_fake12345678'},{fetchImpl:null},{event:{...event,data:{object:{id:'../other'}}}}])
  await assert.rejects(verifyRetrievedStripeTestPayment({...base,fetchImpl:async()=>({ok:true,json:async()=>payment}),...p}))
})
test('reject failed, mismatched or forged independently retrieved payment',async()=>{
 for(const value of [null,{...payment,id:'pi_other12345678'},{...payment,status:'requires_payment_method'},{...payment,metadata:{...payment.metadata,lab_organization_id:'tenant-b'}},{...payment,amount:200,amount_received:200}]){
  await assert.rejects(verifyRetrievedStripeTestPayment({...base,fetchImpl:async()=>({ok:true,json:async()=>value})}))
 }
 for(const fetchImpl of [async()=>{throw Error('network')},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('json')}})])
  await assert.rejects(verifyRetrievedStripeTestPayment({...base,fetchImpl}))
})
