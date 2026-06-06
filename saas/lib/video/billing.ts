export type BillingProviderLink = {
  provider: 'stripe' | 'paypal'
  url: string
}

export type ExtraRenderBilling = {
  required: boolean
  amountCents: number
  currency: 'usd'
  providers: BillingProviderLink[]
  message: string
}

const EXTRA_RENDER_AMOUNT_CENTS = 399

export async function createExtraRenderBilling(userId: string, jobId: string): Promise<ExtraRenderBilling> {
  const providers: BillingProviderLink[] = []
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signalboost.ai'

  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_VIDEO_EXTRA_RENDER) {
    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price]': process.env.STRIPE_PRICE_VIDEO_EXTRA_RENDER,
      'line_items[0][quantity]': '1',
      success_url: `${baseUrl}/dashboard/video?extra_render=paid&job=${encodeURIComponent(jobId)}`,
      cancel_url: `${baseUrl}/dashboard/video?extra_render=cancelled&job=${encodeURIComponent(jobId)}`,
      'metadata[userId]': userId,
      'metadata[jobId]': jobId,
      'metadata[productLine]': 'video_export_extra',
    })

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const session = await response.json()
    if (response.ok && session?.url) providers.push({ provider: 'stripe', url: String(session.url) })
  }

  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    const host = process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com'
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
    const tokenResponse = await fetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    const token = await tokenResponse.json()
    if (tokenResponse.ok && token?.access_token) {
      const orderResponse = await fetch(`${host}/v2/checkout/orders`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: jobId,
            custom_id: `${userId}:${jobId}`,
            amount: { currency_code: 'USD', value: (EXTRA_RENDER_AMOUNT_CENTS / 100).toFixed(2) },
          }],
          application_context: {
            return_url: `${baseUrl}/dashboard/video?extra_render=paypal_paid&job=${encodeURIComponent(jobId)}`,
            cancel_url: `${baseUrl}/dashboard/video?extra_render=paypal_cancelled&job=${encodeURIComponent(jobId)}`,
          },
        }),
      })
      const order = await orderResponse.json()
      const approval = Array.isArray(order?.links) ? order.links.find((link: any) => link?.rel === 'approve') : null
      if (orderResponse.ok && approval?.href) providers.push({ provider: 'paypal', url: String(approval.href) })
    }
  }

  return {
    required: true,
    amountCents: EXTRA_RENDER_AMOUNT_CENTS,
    currency: 'usd',
    providers,
    message: providers.length
      ? 'Your plan quota is used. Complete an extra render payment to continue.'
      : 'Your plan quota is used. Configure Stripe or PayPal extra-render billing to continue.',
  }
}
