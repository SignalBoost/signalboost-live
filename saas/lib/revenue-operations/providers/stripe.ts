import type {
  RevenueProviderAdapter,
  RevenueProviderCapability,
  RevenueProviderContext,
  RevenueProviderHealth,
  RevenueProviderResult,
} from '../contracts'
import { resolveRevenueSecrets } from '../secretResolver'

const STRIPE_BASE = 'https://api.stripe.com/v1'

function now() { return new Date().toISOString() }

function toForm(input: Record<string, unknown>, prefix = ''): URLSearchParams {
  const form = new URLSearchParams()
  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(`${key}[${index}]`, item))
      return
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => append(`${key}[${childKey}]`, child))
      return
    }
    form.append(key, String(value))
  }
  Object.entries(input).forEach(([key, value]) => append(prefix ? `${prefix}[${key}]` : key, value))
  return form
}

abstract class StripeBaseAdapter implements RevenueProviderAdapter {
  abstract readonly providerId: string
  abstract readonly displayName: string
  abstract readonly domain: 'payment' | 'subscription'
  abstract readonly capabilities: readonly RevenueProviderCapability[]

  protected apiKey(context: RevenueProviderContext) {
    const secrets = resolveRevenueSecrets(context)
    if (!secrets.STRIPE_SECRET_KEY) throw new Error('STRIPE_CONNECTION_INCOMPLETE')
    return secrets.STRIPE_SECRET_KEY
  }

  protected async request(context: RevenueProviderContext, path: string, init?: RequestInit) {
    const response = await fetch(`${STRIPE_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey(context)}`,
        ...(init?.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(`STRIPE_API_ERROR:${body?.error?.code || body?.error?.message || `HTTP_${response.status}`}`)
    }
    return body
  }

  async testConnection(context: RevenueProviderContext): Promise<RevenueProviderHealth> {
    try {
      await this.request(context, '/customers?limit=1')
      return { state: 'healthy', checkedAt: now() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      return {
        state: /INCOMPLETE|MISSING/.test(message) ? 'unconfigured' : /401|authentication|api_key/i.test(message) ? 'authentication_failed' : 'offline',
        checkedAt: now(),
        messageKey: message,
      }
    }
  }

  async execute<TInput, TOutput>(capability: RevenueProviderCapability, input: TInput, context: RevenueProviderContext): Promise<RevenueProviderResult<TOutput>> {
    if (!this.capabilities.includes(capability as any)) return { ok: false, errorCode: 'STRIPE_CAPABILITY_UNSUPPORTED', retrievedAt: now() }
    try {
      const data = await this.executeInternal(capability, input as any, context)
      return { ok: true, data: data as TOutput, providerRecordId: data?.id, retrievedAt: now() }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'STRIPE_EXECUTION_FAILED', retrievedAt: now() }
    }
  }

  protected abstract executeInternal(capability: RevenueProviderCapability, input: any, context: RevenueProviderContext): Promise<any>

  protected async customerLookup(input: any, context: RevenueProviderContext) {
    if (input?.id) return this.request(context, `/customers/${encodeURIComponent(String(input.id))}`)
    if (input?.email) return this.request(context, `/customers?email=${encodeURIComponent(String(input.email))}&limit=20`)
    throw new Error('STRIPE_INPUT_REQUIRED:customer_id_or_email')
  }

  protected async customerUpsert(input: any, context: RevenueProviderContext) {
    const payload = input?.payload || input
    const id = payload?.id || input?.id
    const clean = { ...payload }
    delete clean.id
    if (id) return this.request(context, `/customers/${encodeURIComponent(String(id))}`, { method: 'POST', body: toForm(clean).toString() })
    return this.request(context, '/customers', { method: 'POST', body: toForm(clean).toString() })
  }
}

export class StripePaymentAdapter extends StripeBaseAdapter {
  readonly providerId = 'stripe'
  readonly displayName = 'Stripe'
  readonly domain = 'payment' as const
  readonly capabilities = ['customer_lookup','customer_upsert','payment_status','payment_record'] as const satisfies readonly RevenueProviderCapability[]

  protected async executeInternal(capability: RevenueProviderCapability, input: any, context: RevenueProviderContext) {
    if (capability === 'customer_lookup') return this.customerLookup(input, context)
    if (capability === 'customer_upsert') return this.customerUpsert(input, context)
    if (capability === 'payment_status') {
      const id = String(input?.paymentIntentId || input?.id || '').trim()
      if (!id) throw new Error('STRIPE_INPUT_REQUIRED:paymentIntentId')
      return this.request(context, `/payment_intents/${encodeURIComponent(id)}`)
    }
    if (capability === 'payment_record') {
      const payload = input?.payload || input
      return this.request(context, '/payment_intents', { method: 'POST', body: toForm(payload).toString() })
    }
    throw new Error('STRIPE_CAPABILITY_UNSUPPORTED')
  }
}

export class StripeBillingAdapter extends StripeBaseAdapter {
  readonly providerId = 'stripe-billing'
  readonly displayName = 'Stripe Billing'
  readonly domain = 'subscription' as const
  readonly capabilities = ['customer_lookup','customer_upsert','subscription_create','subscription_lookup','subscription_update','renewal_lookup','payment_status'] as const satisfies readonly RevenueProviderCapability[]

  protected async executeInternal(capability: RevenueProviderCapability, input: any, context: RevenueProviderContext) {
    if (capability === 'customer_lookup') return this.customerLookup(input, context)
    if (capability === 'customer_upsert') return this.customerUpsert(input, context)
    if (capability === 'subscription_create') {
      const payload = input?.payload || input
      return this.request(context, '/subscriptions', { method: 'POST', body: toForm(payload).toString() })
    }
    if (capability === 'subscription_lookup' || capability === 'renewal_lookup') {
      const id = String(input?.subscriptionId || input?.id || '').trim()
      if (!id) throw new Error('STRIPE_INPUT_REQUIRED:subscriptionId')
      const subscription = await this.request(context, `/subscriptions/${encodeURIComponent(id)}`)
      if (capability === 'subscription_lookup') return subscription
      return {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end,
        trialEnd: subscription.trial_end,
        raw: subscription,
      }
    }
    if (capability === 'subscription_update') {
      const id = String(input?.subscriptionId || input?.id || '').trim()
      if (!id) throw new Error('STRIPE_INPUT_REQUIRED:subscriptionId')
      const payload = input?.payload || input
      const clean = { ...payload }
      delete clean.subscriptionId
      delete clean.id
      return this.request(context, `/subscriptions/${encodeURIComponent(id)}`, { method: 'POST', body: toForm(clean).toString() })
    }
    if (capability === 'payment_status') {
      const id = String(input?.paymentIntentId || input?.id || '').trim()
      if (!id) throw new Error('STRIPE_INPUT_REQUIRED:paymentIntentId')
      return this.request(context, `/payment_intents/${encodeURIComponent(id)}`)
    }
    throw new Error('STRIPE_CAPABILITY_UNSUPPORTED')
  }
}
