// Isolated test-mode retrieval boundary, not connected to production webhook or grants.
// Caller must supply an HTTPS Stripe API transport and a restricted sk_test_ key.
import { validateAuthoritativeTestPayment } from './phase4StripeTestVerification.mjs'
export async function verifyRetrievedStripeTestPayment({
 event,tenantId,approvedPrice,stripeSecretKey,fetchImpl,signal
}) {
 if(typeof stripeSecretKey!=='string'||!/^sk_test_[A-Za-z0-9_]{8,}$/.test(stripeSecretKey))
   throw Error('stripe_test_secret_required')
 const paymentId=event?.data?.object?.id
 if(!/^pi_[A-Za-z0-9_]{8,}$/.test(paymentId||'')) throw Error('stripe_test_payment_id_invalid')
 if(typeof fetchImpl!=='function') throw Error('stripe_transport_missing')
 const url='https://api.stripe.com/v1/payment_intents/'+encodeURIComponent(paymentId)
 let response
 try {
  response=await fetchImpl(url,{
   method:'GET',
   headers:{Authorization:'Bearer '+stripeSecretKey},
   redirect:'error',
   cache:'no-store',
   signal
  })
 } catch {throw Error('stripe_authoritative_retrieval_unavailable')}
 if(!response||response.ok!==true||typeof response.json!=='function')
   throw Error('stripe_authoritative_retrieval_failed')
 let intent
 try {intent=await response.json()}catch {throw Error('stripe_authoritative_json_invalid')}
 return validateAuthoritativeTestPayment({event,paymentIntent:intent,tenantId,approvedPrice})
}
