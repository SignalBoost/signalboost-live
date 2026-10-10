import test from 'node:test'
import assert from 'node:assert/strict'
import {createLabTestCheckout} from '../lib/billing/phase4StripeTestCheckout.mjs'
const org='12345678-1234-4234-8234-123456789abc'
const rate='12345678-1234-4234-8234-123456789abd'
const base={trustedTestHost:true,tenantAuthorized:true,organizationId:org,
 approvedRate:{rateVersionId:rate,currencyCode:'USD',creditsPerUsd:10,active:true},
 quantityUsd:5,successUrl:'https://example.org/lab/success',
 cancelUrl:'https://example.org/lab/cancel',stripeSecretKey:'sk_test_mock_only_1234567890',
 idempotencyKey:'lab-test-a781ddefc6fc4ce3bb33',fetchImpl:async()=>({ok:true,json:async()=>({
 object:'checkout.session',id:'cs_test_1234567890',mode:'payment',livemode:false,
 url:'https://checkout.stripe.com/c/pay/cs_test_1234567890'})})}
test('creates a test-only checkout bound to exact tenant rate and amount',async()=>{
 let called=0
 const result=await createLabTestCheckout({...base,fetchImpl:async(url,options)=>{
  called++
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions')
  assert.equal(options.method,'POST')
  assert.match(options.headers.Authorization,/^Bearer sk_test_/)
  const form=new URLSearchParams(options.body)
  assert.equal(form.get('mode'),'payment')
  assert.equal(form.get('line_items[0][price_data][unit_amount]'),'500')
  assert.equal(form.get('payment_intent_data[metadata][lab_organization_id]'),org)
  assert.equal(form.get('payment_intent_data[metadata][price_version_id]'),rate)
  return base.fetchImpl()
 }})
 assert.equal(called,1)
 assert.equal(result.testOnly,true)
 assert.equal(result.expectedCredits,50)
 assert.ok(Object.isFrozen(result))
})
test('denies untrusted callers, live credentials, missing rates, unapproved destinations and overflow',async()=>{
 for(const change of [
  {trustedTestHost:false},{tenantAuthorized:false},{organizationId:'wrong'},
  {approvedRate:{...base.approvedRate,active:false}},
  {approvedRate:{...base.approvedRate,creditsPerUsd:0}},
  {quantityUsd:0},{quantityUsd:1.5},{quantityUsd:10001},
  {stripeSecretKey:'sk_live_not_allowed1234'},
  {successUrl:'http://example.org/lab/success'},
  {cancelUrl:'https://user:pass@example.org/lab/cancel'},
  {idempotencyKey:'not-a-validated-id'}
 ]) {let calls=0;await assert.rejects(createLabTestCheckout({...base,...change,fetchImpl:async()=>{calls++;return base.fetchImpl()}}));assert.equal(calls,0)}
})
test('rejects live-mode, malformed or non-Stripe checkout response',async()=>{
 for(const session of [
  {object:'checkout.session',id:'cs_live_1234567890',livemode:true,mode:'payment',url:'https://checkout.stripe.com/x'},
  {object:'checkout.session',id:'cs_test_1234567890',livemode:false,mode:'subscription',url:'https://checkout.stripe.com/x'},
  {object:'checkout.session',id:'cs_test_1234567890',livemode:false,mode:'payment',url:'https://attacker.example.com/x'}
 ]) await assert.rejects(createLabTestCheckout({...base,fetchImpl:async()=>({ok:true,json:async()=>session})}))
})
