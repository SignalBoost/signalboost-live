import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PROCESSING_RATE = 0.15
const MAX_BUDGET = 100000

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

async function createStripeCheckoutSession(request: Request, amountCents: number, selectedBudget: number, processingFee: number) {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) return null

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://saas.signalboostapp.com'
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', origin + '/agency?checkout=success')
  params.set('cancel_url', origin + '/agency?checkout=cancelled')
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][unit_amount]', String(amountCents))
  params.set('line_items[0][price_data][product_data][name]', 'SignalBoost pre-funded campaign budget')
  params.set('metadata[selectedBudget]', String(selectedBudget))
  params.set('metadata[processingFee]', String(processingFee))
  params.set('metadata[signalboost_product]', 'agency_engine')
  params.set('metadata[dispatch_locked]', 'true')

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.url) return null
  return String(json.url)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const selectedBudget = Number(body?.selectedBudget)
  const createStripeSession = Boolean(body?.createStripeSession)

  if (!Number.isFinite(selectedBudget) || selectedBudget <= 0 || selectedBudget > MAX_BUDGET) {
    return NextResponse.json({ error: 'selectedBudget must be greater than zero' }, { status: 400 })
  }

  const normalizedBudget = roundMoney(selectedBudget)
  const processingFee = roundMoney(normalizedBudget * PROCESSING_RATE)
  const totalCharged = roundMoney(normalizedBudget + processingFee)
  const amountCents = Math.round(totalCharged * 100)

  let stripeCheckoutUrl: string | undefined
  if (createStripeSession) {
    stripeCheckoutUrl = await createStripeCheckoutSession(request, amountCents, normalizedBudget, processingFee) || undefined
  }

  return NextResponse.json({
    selectedBudget: normalizedBudget,
    processingFee,
    totalCharged,
    currency: 'USD',
    status: stripeCheckoutUrl ? 'STRIPE_CHECKOUT_READY' : 'CHECKOUT_READY',
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeCheckoutUrl,
    dispatchLocked: true,
  })
}
