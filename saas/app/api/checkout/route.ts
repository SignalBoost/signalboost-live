import { NextRequest, NextResponse } from 'next/server'

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER as string,
  pro:     process.env.STRIPE_PRICE_PRO as string,
  business: process.env.STRIPE_PRICE_BUSINESS as string,
}

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json()
    const priceId = PRICE_IDS[plan]

    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'subscription_data[trial_period_days]': '30',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      }).toString(),
    })

    const session = await stripeRes.json()

    if (!stripeRes.ok) {
      return NextResponse.json({ error: session.error?.message }, { status: 400 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
