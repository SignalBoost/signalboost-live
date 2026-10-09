import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {verifyStripeTestEvent,validateAuthoritativeTestPayment} from '../lib/billing/phase4StripeTestVerification.mjs'
const secret='whsec_synthetic_not_a_real_secret'
const now=1800000000
const event={id:'evt_1234567890',livemode:false,type:'payment_intent.succeeded',data:{object:{id:'pi_1234567890'}}}
const raw=JSON.stringify(event)
const sig=t=>`t=${t},v1=${createHmac('sha256',secret).update(t+'.'+raw).digest('hex')}`
const intent={id:'pi_1234567890',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd',metadata:{lab_organization_id:'tenant-a',purpose:'itmounts_lab_credits',price_version_id:'rate-1'}}
const approvedPrice={currency:'usd',amountMinor:500,credits:50,rateVersionId:'rate-1'}
test('authentic test-mode event and independently retrieved payment match exact approved tenant and price',()=>{
 const verified=verifyStripeTestEvent({rawBody:raw,signatureHeader:sig(now),webhookSecret:secret,nowSeconds:now})
 const proof=validateAuthoritativeTestPayment({event:verified,paymentIntent:intent,tenantId:'tenant-a',approvedPrice})
 assert.equal(proof.credits,50)
 assert.equal(proof.stripePaymentIntentId,'pi_1234567890')
})
test('reject expired and forged signatures',()=>{
 for(const header of [sig(now-301),sig(now+301),'t='+now+',v1='+('a'.repeat(64))])
 assert.throws(()=>verifyStripeTestEvent({rawBody:raw,signatureHeader:header,webhookSecret:secret,nowSeconds:now}))
})
test('reject live, tenant substitution, mismatched amount, and unapproved rate',()=>{
 const bad=[{event:{...event,livemode:true}},{paymentIntent:{...intent,livemode:true}},{paymentIntent:{...intent,metadata:{...intent.metadata,lab_organization_id:'tenant-b'}}},{paymentIntent:{...intent,amount_received:400}},{approvedPrice:{...approvedPrice,credits:0}},{approvedPrice:{...approvedPrice,rateVersionId:'rate-2'}}]
 for(const x of bad) assert.throws(()=>validateAuthoritativeTestPayment({event,paymentIntent:intent,tenantId:'tenant-a',approvedPrice,...x}))
})
test('never trust webhook object payment fields without authoritative payment intent',()=>{
 assert.throws(()=>validateAuthoritativeTestPayment({event,paymentIntent:null,tenantId:'tenant-a',approvedPrice}))
})
