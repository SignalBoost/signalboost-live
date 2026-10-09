// Closed test-only adapter. This is not a customer-facing settlement endpoint.
// The trusted database executor is supplied explicitly by the controlled test host;
// neither an untrusted caller nor a verified envelope independently grants credits.
import {buildVerifiedTestSettlementEnvelope} from './phase4VerifiedTestSettlementEnvelope.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function stageVerifiedTestSettlement(input) {
 const {trustedTestHost,organizationId,rateVersionId,executeTestSettlement}=input
 if(trustedTestHost!==true || process.env.NODE_ENV==='production')
  throw Error('stripe_test_settlement_host_denied')
 if(typeof executeTestSettlement!=='function'||!uuid.test(organizationId||'')||!uuid.test(rateVersionId||''))
  throw Error('stripe_test_settlement_executor_denied')
 if(input.tenantId!==organizationId||input.approvedPrice?.rateVersionId!==rateVersionId)
  throw Error('stripe_test_settlement_tenant_or_rate_mismatch')
 const envelope=await buildVerifiedTestSettlementEnvelope(input)
 if(envelope.organizationId!==organizationId||envelope.rateVersionId!==rateVersionId
    ||envelope.kind!=='test_only_unsettled_evidence'||envelope.stripeLivemode!==false
    ||envelope.currencyCode!=='USD'||envelope.amountReceivedMinor%100!==0)
  throw Error('stripe_test_settlement_envelope_invalid')
 // A trusted host may invoke the database's postgres-only synthetic proof using
 // these exact values; the database remains the final authority for test grants.
 // No service-role/client access is enabled by this module.
 const args=Object.freeze({
  organizationId,eventId:envelope.stripeEventId,paymentIntentId:envelope.stripePaymentIntentId,
  accountId:envelope.stripeAccountId,rateVersionId,
  amountMinor:envelope.amountReceivedMinor,currency:envelope.currencyCode,
  payloadSha256:envelope.payloadSha256,credits:envelope.credits
 })
 return executeTestSettlement(args)
}
