// Pure, closed-default Stripe test-mode proof validation. No API or wallet writes.
import { createHmac, timingSafeEqual } from 'node:crypto'
const id=(v,prefix)=>typeof v==='string' && new RegExp('^'+prefix+'[A-Za-z0-9_]{8,}$').test(v)
export function verifyStripeTestEvent({rawBody, signatureHeader, webhookSecret, nowSeconds=Math.floor(Date.now()/1000), toleranceSeconds=300}) {
 if(typeof rawBody!=='string'||typeof signatureHeader!=='string'||!webhookSecret?.startsWith('whsec_')) throw Error('stripe_signature_missing')
 const parts=signatureHeader.split(',').map(x=>x.trim().split('='))
 const ts=parts.find(([k])=>k==='t')?.[1]
 const signatures=parts.filter(([k])=>k==='v1').map(x=>x[1])
 if(!ts||!/^[0-9]{1,12}$/.test(ts)||!signatures.length||Math.abs(nowSeconds-Number(ts))>toleranceSeconds) throw Error('stripe_signature_invalid')
 const expected=createHmac('sha256',webhookSecret).update(ts+'.'+rawBody).digest()
 if(!signatures.some(s=>typeof s==='string' && /^[0-9a-f]{64}$/i.test(s) && timingSafeEqual(expected,Buffer.from(s,'hex')))) throw Error('stripe_signature_invalid')
 let event
 try {event=JSON.parse(rawBody)}catch {throw Error('stripe_event_invalid')}
 if(!id(event?.id,'evt_')||event.livemode!==false||event.type!=='payment_intent.succeeded')throw Error('stripe_event_not_test_payment')
 return event
}
export function validateAuthoritativeTestPayment({event,paymentIntent,tenantId,approvedPrice}) {
 // paymentIntent must be separately fetched from Stripe server-to-server; never trust
 // payment details included in the webhook body as the authoritative source.
 if(!id(event?.id,'evt_')||event.livemode!==false||event.type!=='payment_intent.succeeded'
   ||!id(event.data?.object?.id,'pi_')) throw Error('stripe_test_event_invalid')
 if(!paymentIntent||paymentIntent.id!==event.data.object.id||paymentIntent.livemode!==false
    ||paymentIntent.status!=='succeeded'||!Number.isSafeInteger(paymentIntent.amount_received)
    ||!Number.isSafeInteger(paymentIntent.amount)||paymentIntent.amount_received<=0
    ||paymentIntent.amount_received!==paymentIntent.amount
    ||!id(paymentIntent.id,'pi_')) throw Error('stripe_authoritative_payment_invalid')
 if(typeof tenantId!=='string'||!tenantId||paymentIntent.metadata?.lab_organization_id!==tenantId
    ||paymentIntent.metadata?.purpose!=='itmounts_lab_credits') throw Error('stripe_tenant_binding_invalid')
 if(!approvedPrice||approvedPrice.currency!=='usd'||paymentIntent.currency!=='usd'
    ||!Number.isSafeInteger(approvedPrice.amountMinor)||approvedPrice.amountMinor<=0
    ||paymentIntent.amount_received!==approvedPrice.amountMinor
    ||paymentIntent.metadata?.price_version_id!==approvedPrice.rateVersionId
    ||!Number.isSafeInteger(approvedPrice.credits)||approvedPrice.credits<=0)
    throw Error('stripe_price_not_approved')
 return Object.freeze({stripeEventId:event.id,stripePaymentIntentId:paymentIntent.id,
  organizationId:tenantId,amountReceivedMinor:paymentIntent.amount_received,
  currencyCode:'USD',rateVersionId:approvedPrice.rateVersionId,credits:approvedPrice.credits})
}
