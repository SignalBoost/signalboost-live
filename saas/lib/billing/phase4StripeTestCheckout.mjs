// Private Stripe TEST checkout contract only. No route is exposed and no live-mode checkout is possible.
// Caller must resolve tenant ownership and the immutable approved rate from trusted server/database state.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const testKey=/^sk_test_[A-Za-z0-9_]{8,}$/
const safeUrl=value=>{
 try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && u.hash==='' }
 catch { return false }
}
export async function createLabTestCheckout({
 trustedTestHost, tenantAuthorized, organizationId, approvedRate, quantityUsd,
 successUrl, cancelUrl, stripeSecretKey, fetchImpl, idempotencyKey
}) {
 if(trustedTestHost!==true || tenantAuthorized!==true || process.env.NODE_ENV==='production')
  throw Error('lab_test_checkout_host_denied')
 if(!uuid.test(organizationId||'')||!uuid.test(approvedRate?.rateVersionId||'')
   ||approvedRate?.currencyCode!=='USD'||approvedRate?.active!==true
   ||!Number.isSafeInteger(approvedRate.creditsPerUsd)||approvedRate.creditsPerUsd<=0)
  throw Error('lab_test_checkout_approved_rate_missing')
 // No pricing defaults: caller must supply an explicitly approved rate revision and denomination.
 if(!Number.isSafeInteger(quantityUsd)||quantityUsd<=0||quantityUsd>10000
   ||!testKey.test(stripeSecretKey||'')||typeof fetchImpl!=='function'
   ||!safeUrl(successUrl)||!safeUrl(cancelUrl)
   ||typeof idempotencyKey!=='string'||!/^lab-test-[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey))
  throw Error('lab_test_checkout_invalid')
 const amount=quantityUsd*100
 const credits=quantityUsd*approvedRate.creditsPerUsd
 if(!Number.isSafeInteger(credits)||credits<=0) throw Error('lab_test_checkout_overflow')
 const params=new URLSearchParams({
  mode:'payment',
  'line_items[0][price_data][currency]':'usd',
  'line_items[0][price_data][unit_amount]':String(amount),
  'line_items[0][price_data][product_data][name]':'iTMounts LAB software credits (TEST)',
  'line_items[0][quantity]':'1',
  success_url:successUrl,
  cancel_url:cancelUrl,
  'payment_intent_data[metadata][lab_organization_id]':organizationId,
  'payment_intent_data[metadata][purpose]':'itmounts_lab_credits',
  'payment_intent_data[metadata][price_version_id]':approvedRate.rateVersionId,
  'metadata[lab_organization_id]':organizationId,
  'metadata[price_version_id]':approvedRate.rateVersionId
 })
 let response
 try {response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{
  method:'POST',headers:{Authorization:'Bearer '+stripeSecretKey,
   'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey},
  body:params.toString(),redirect:'error',cache:'no-store'
 })}catch{throw Error('lab_test_checkout_stripe_unavailable')}
 if(!response?.ok||typeof response.json!=='function') throw Error('lab_test_checkout_stripe_rejected')
 let session
 try{session=await response.json()}catch{throw Error('lab_test_checkout_stripe_invalid')}
 if(session?.object!=='checkout.session'||session.mode!=='payment'||session.livemode!==false
   ||typeof session.id!=='string'||!/^cs_test_[A-Za-z0-9_]+$/.test(session.id)
   ||!safeUrl(session.url)||!session.url.startsWith('https://checkout.stripe.com/'))
  throw Error('lab_test_checkout_response_denied')
 return Object.freeze({checkoutSessionId:session.id,checkoutUrl:session.url,expectedCredits:credits,
  amountMinor:amount,rateVersionId:approvedRate.rateVersionId,organizationId,testOnly:true})
}
