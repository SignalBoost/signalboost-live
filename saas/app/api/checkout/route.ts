import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PRICE_IDS: Record<string, string> = {
  starter:  process.env.STRIPE_PRICE_STARTER  as string,
  pro:      process.env.STRIPE_PRICE_PRO      as string,
  business: process.env.STRIPE_PRICE_BUSINESS as string,
}

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json()
    const priceId = PRICE_IDS[plan]

    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Get the current user from Supabase auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    let userId = ''

    if (token) {
      const { data } = await supabase.auth.getUser(token)
      userId = data?.user?.id || ''
    }

    const params: Record<string, string> = {
      mode:                          'subscription',
      'payment_method_types[0]':     'card',
      'line_items[0][price]':        priceId,
      'line_items[0][quantity]':     '1',
      success_url:                   `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url:                    `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      'metadata[userId]':            userId,
      'metadata[priceId]':           priceId,
      'metadata[plan]':              plan,
    }

    // Only add trial for Starter plan
    if (plan === 'starter') {
      params['subscription_data[trial_period_days]'] = '30'
      params['subscription_data[metadata][userId]']  = userId
      params['subscription_data[metadata][priceId]'] = priceId
    } else {
      params['subscription_data[metadata][userId]']  = userId
      params['subscription_data[metadata][priceId]'] = priceId
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
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
