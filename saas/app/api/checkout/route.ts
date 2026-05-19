import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
    // Read the logged-in user from Supabase cookies (Next.js SSR pattern)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Called from a Server Component — safe to ignore
            }
          },
        },
      }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user?.id) {
      console.error('Checkout: no authenticated user', authError?.message)
      return NextResponse.json(
        { error: 'You must be signed in to subscribe.' },
        { status: 401 }
      )
    }
    const userId = user.id
    const userEmail = user.email || ''
    console.log('Checkout: creating session for', { userId, plan, priceId })
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
      // Attach the userId to the subscription too, so future subscription events have it
      'subscription_data[metadata][userId]':  userId,
      'subscription_data[metadata][priceId]': priceId,
      'subscription_data[metadata][plan]':    plan,
    }
    // Pre-fill the email on the Stripe Checkout form for a smoother UX
    if (userEmail) {
      params['customer_email'] = userEmail
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
      console.error('Stripe checkout creation failed', session.error)
      return NextResponse.json(
        { error: session.error?.message || 'Stripe error' },
        { status: 400 }
      )
    }
    console.log('Checkout: session created', session.id)
    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Checkout route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
