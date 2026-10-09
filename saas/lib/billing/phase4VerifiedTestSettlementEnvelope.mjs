// Test-mode evidence envelope ONLY. No database writes or payment settlement authority.
// An eventual server-side settlement adapter must separately authorize ownership,
// bind the Stripe account, and execute the SQL transaction; this module grants nothing.
import {createHash} from 'node:crypto'
import {verifyStripeTestEvent} from './phase4StripeTestVerification.mjs'
import {verifyRetrievedStripeTestPayment} from './phase4StripeTestRetrieval.mjs'

export async function buildVerifiedTestSettlementEnvelope({
 rawBody,signatureHeader,webhookSecret,nowSeconds,
 stripeSecretKey,fetchImpl,tenantId,approvedPrice,stripeAccountId,signal
}) {
 const event=verifyStripeTestEvent({rawBody,signatureHeader,webhookSecret,nowSeconds})
 if(typeof stripeAccountId!=='string'||!/^acct_[A-Za-z0-9_]{8,}$/.test(stripeAccountId))
  throw Error('stripe_account_not_pinned')
 // Fetch the authoritative payment *only after* validating the signed event.
 const verified=await verifyRetrievedStripeTestPayment({
  event,tenantId,approvedPrice,stripeSecretKey,fetchImpl,signal
 })
 // An envelope is not a financial receipt and cannot grant credits on its own.
 // Explicitly keep Stripe live mode unrepresentable.
 return Object.freeze({
  kind:'test_only_unsettled_evidence',stripeLivemode:false,
  organizationId:verified.organizationId,
  stripeEventId:verified.stripeEventId,
  stripePaymentIntentId:verified.stripePaymentIntentId,
  stripeAccountId,
  rateVersionId:verified.rateVersionId,
  amountReceivedMinor:verified.amountReceivedMinor,
  currencyCode:verified.currencyCode,
  credits:verified.credits,
  payloadSha256:createHash('sha256').update(rawBody,'utf8').digest('hex')
 })
}
