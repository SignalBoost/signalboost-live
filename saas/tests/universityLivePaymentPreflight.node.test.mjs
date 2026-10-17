import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectUniversityLivePayment} from '../lib/billing/universityLivePaymentPreflight.mjs'
const org='12345678-1234-4234-8234-123456789abc'
const rate='12345678-1234-4234-8234-123456789abd'
const paymentIntent={object:'payment_intent',id:'pi_university12345',livemode:true,status:'succeeded',
 currency:'usd',amount:500,amount_received:500,
 metadata:{purpose:'itmounts_lab_credits',lab_organization_id:org,price_version_id:rate}}
const input={paymentIntent,organizationId:org,priceVersionId:rate,amountMinor:500}
test('strict live preflight accepts matching University payment evidence without a side effect',()=>{
 assert.equal(inspectUniversityLivePayment(input).eligible,true)
})
test('rejects non-University Stripe payments and wrong customers',()=>{
 for(const changes of [
  {metadata:{...paymentIntent.metadata,purpose:'other'}},
  {metadata:{...paymentIntent.metadata,lab_organization_id:'other'}},
  {metadata:{...paymentIntent.metadata,price_version_id:'other'}},
  {status:'requires_payment_method'},{livemode:false},{amount_received:0},{currency:'eur'},
  {object:'charge'}
 ]) assert.equal(inspectUniversityLivePayment({...input,paymentIntent:{...paymentIntent,...changes}}).eligible,false)
})
test('rejects amount manipulation and unapproved rate binding',()=>{
 for(const changes of [{amountMinor:600},{amountMinor:0},{priceVersionId:'other'},{organizationId:'other'}])
  assert.equal(inspectUniversityLivePayment({...input,...changes}).eligible,false)
})
