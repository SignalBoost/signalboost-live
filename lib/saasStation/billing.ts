import type { ModuleDefinition } from './modules'

export type BillingProvider = 'stripe' | 'paypal' | 'internal'

export type BillingCharge = {
  provider: BillingProvider
  status: 'not_required' | 'charged' | 'requires_checkout' | 'configured_fallback'
  amountCents: number
  currency: 'usd'
  checkoutUrl: string | null
  invoiceReference: string
  explanation: string
}

export type BillingInput = {
  module: ModuleDefinition
  userId: string
  overageUnits: number
  provider?: BillingProvider
}

function buildReference(moduleKey: string, userId: string, amountCents: number) {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'anonymous'
  return `sb_${moduleKey}_${safeUser}_${amountCents}`
}

export function createOverageCharge(input: BillingInput): BillingCharge {
  const amountCents = Math.max(0, input.overageUnits) * input.module.overageUnitCents
  if (amountCents === 0) {
    return {
      provider: 'internal',
      status: 'not_required',
      amountCents: 0,
      currency: 'usd',
      checkoutUrl: null,
      invoiceReference: buildReference(input.module.key, input.userId, 0),
      explanation: 'Usage is within quota; no overage charge is required.',
    }
  }

  const provider = input.provider ?? (process.env.STRIPE_SECRET_KEY ? 'stripe' : process.env.PAYPAL_CLIENT_ID ? 'paypal' : 'internal')
  const reference = buildReference(input.module.key, input.userId, amountCents)

  if (provider === 'stripe' && process.env.STRIPE_PAYMENT_LINK_BASE) {
    const checkoutUrl = new URL(process.env.STRIPE_PAYMENT_LINK_BASE)
    checkoutUrl.searchParams.set('client_reference_id', reference)
    checkoutUrl.searchParams.set('amount_cents', String(amountCents))
    checkoutUrl.searchParams.set('module', input.module.key)
    return {
      provider,
      status: 'requires_checkout',
      amountCents,
      currency: 'usd',
      checkoutUrl: checkoutUrl.toString(),
      invoiceReference: reference,
      explanation: 'Quota was exceeded; Stripe checkout is ready for overage collection.',
    }
  }

  if (provider === 'paypal' && process.env.PAYPAL_CHECKOUT_BASE) {
    const checkoutUrl = new URL(process.env.PAYPAL_CHECKOUT_BASE)
    checkoutUrl.searchParams.set('custom_id', reference)
    checkoutUrl.searchParams.set('amount', (amountCents / 100).toFixed(2))
    checkoutUrl.searchParams.set('currency', 'USD')
    checkoutUrl.searchParams.set('module', input.module.key)
    return {
      provider,
      status: 'requires_checkout',
      amountCents,
      currency: 'usd',
      checkoutUrl: checkoutUrl.toString(),
      invoiceReference: reference,
      explanation: 'Quota was exceeded; PayPal checkout is ready for overage collection.',
    }
  }

  return {
    provider,
    status: 'configured_fallback',
    amountCents,
    currency: 'usd',
    checkoutUrl: null,
    invoiceReference: reference,
    explanation: 'Quota was exceeded; overage is recorded for the billing ledger because live checkout URLs are not configured in this environment.',
  }
}
