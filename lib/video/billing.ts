import type { VideoQuota } from '@/lib/video/types'

type BillingSessionInput = { jobId: string; quota: VideoQuota; returnUrl: string }

export async function createOverageBillingSession({ jobId, quota, returnUrl }: BillingSessionInput) {
  if (!quota.requiresOverageCharge) return null
  const amountCents = Math.max(50, Math.round(quota.overageMinutes * quota.overageRateUsd * 100))

  if (quota.overageProvider === 'stripe' && process.env.STRIPE_SECRET_KEY) {
    const params = new URLSearchParams({
      mode: 'payment',
      success_url: `${returnUrl}?video_job=${jobId}&billing=stripe_success`,
      cancel_url: `${returnUrl}?video_job=${jobId}&billing=stripe_cancelled`,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]': `SignalBoost video overage (${quota.overageMinutes} min)`,
      'metadata[job_id]': jobId,
      'metadata[kind]': 'video_overage',
    })
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    const session = await response.json()
    if (!response.ok) throw new Error(session.error?.message || 'Stripe checkout session failed')
    return { provider: 'stripe' as const, amountUsd: amountCents / 100, checkoutUrl: session.url as string, externalId: session.id as string }
  }

  if (quota.overageProvider === 'paypal' && process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com'
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
    const tokenResponse = await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
    const token = await tokenResponse.json()
    if (!tokenResponse.ok) throw new Error(token.error_description || 'PayPal token request failed')
    const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: jobId, amount: { currency_code: 'USD', value: (amountCents / 100).toFixed(2) }, description: `SignalBoost video overage (${quota.overageMinutes} min)` }], application_context: { return_url: `${returnUrl}?video_job=${jobId}&billing=paypal_success`, cancel_url: `${returnUrl}?video_job=${jobId}&billing=paypal_cancelled` } }),
    })
    const order = await orderResponse.json()
    if (!orderResponse.ok) throw new Error(order.message || 'PayPal order failed')
    const approve = order.links?.find((link: { rel: string }) => link.rel === 'approve')?.href
    return { provider: 'paypal' as const, amountUsd: amountCents / 100, checkoutUrl: approve as string, externalId: order.id as string }
  }

  return { provider: quota.overageProvider, amountUsd: amountCents / 100, checkoutUrl: null, externalId: null }
}
