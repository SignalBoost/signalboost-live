// Read-only classification of a server-retrieved live Stripe PaymentIntent.
// This does not grant credits, authorize a checkout or alter Stripe.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const stripeId=/^pi_[A-Za-z0-9_]{8,}$/
export function inspectUniversityLivePayment({paymentIntent,organizationId,priceVersionId,amountMinor,currency='usd'}) {
 const deny=reason=>Object.freeze({eligible:false,reason})
 if (!paymentIntent || paymentIntent.object!=='payment_intent' || !stripeId.test(paymentIntent.id||''))
  return deny('invalid_payment_intent')
 if (paymentIntent.livemode!==true || paymentIntent.status!=='succeeded')
  return deny('not_successful_live_payment')
 if (!uuid.test(organizationId||'') || !uuid.test(priceVersionId||''))
  return deny('unverified_tenant_or_rate')
 if (paymentIntent.metadata?.purpose!=='itmounts_lab_credits' ||
     paymentIntent.metadata?.lab_organization_id!==organizationId)
  return deny('not_university_purchase_or_tenant_mismatch')
 if (paymentIntent.metadata?.price_version_id!==priceVersionId)
  return deny('price_version_mismatch')
 if (!Number.isSafeInteger(amountMinor) || amountMinor<=0 ||
     paymentIntent.currency!==currency ||
     paymentIntent.amount_received!==amountMinor ||
     paymentIntent.amount!==amountMinor)
  return deny('payment_amount_mismatch')
 return Object.freeze({eligible:true,reason:'matched_read_only',paymentIntentId:paymentIntent.id,
   organizationId,priceVersionId,amountMinor,currency})
}
