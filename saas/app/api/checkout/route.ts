import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

// ─── Website plan price IDs (new prices at correct amounts) ───────────────────
// Public plan names (pricing page) map onto the internal plan tiers:
//   launch → starter, growth → pro, command → business.
// Internal names stay the single dialect in Stripe metadata and the database;
// a full platform-wide rename is a post-launch cleanup task.
const PUBLIC_TO_INTERNAL_PLAN: Record<string, string> = {
  launch:  'starter',
  growth:  'pro',
  command: 'business',
}

const WEBSITE_PRICE_IDS: Record<string, string> = {
  starter:  process.env.STRIPE_PRICE_WEBSITE_STARTER  as string,
  pro:      process.env.STRIPE_PRICE_WEBSITE_PRO      as string,
  business: process.env.STRIPE_PRICE_WEBSITE_BUSINESS as string,
}

// ─── Podcast plan price IDs ───────────────────────────────────────────────────
const PODCAST_PRICE_IDS: Record<string, string> = {
  indie:   process.env.STRIPE_PRICE_PODCAST_INDIE   as string,
  pro:     process.env.STRIPE_PRICE_PODCAST_PRO     as string,
  network: process.env.STRIPE_PRICE_PODCAST_NETWORK as string,
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestedPlan: string = String(body.plan || '').toLowerCase()
    // Translate public names (launch/growth/command) to internal tiers; pass
    // internal names through unchanged for backward compatibility.
    const plan: string = PUBLIC_TO_INTERNAL_PLAN[requestedPlan] || requestedPlan
    // productLine defaults to 'website' so the existing pricing page works unchanged
    const productLine: 'website' | 'podcast' = body.productLine ?? 'website'

    const priceMap =
      productLine === 'podcast' ? PODCAST_PRICE_IDS : WEBSITE_PRICE_IDS
    const priceId = priceMap[plan]

    if (!priceId) {
      console.error('Checkout: invalid plan/productLine combo', { plan, productLine })
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // ── Read the logged-in user from Supabase cookies ────────────────────────
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: saasSupabaseCookieOptions,
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch {
              // Called from a Server Component — safe to ignore
            }
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      console.error('Checkout: no authenticated user', authError?.message)
      return NextResponse.json(
        { error: 'You must be signed in to subscribe.' },
        { status: 401 },
      )
    }

    const userId    = user.id
    const userEmail = user.email || ''

    console.log('Checkout: creating session for', { userId, plan, productLine, priceId })

    // ── Build Stripe Checkout Session params ─────────────────────────────────
    const params: Record<string, string> = {
      mode:                                       'subscription',
      'payment_method_types[0]':                  'card',
      'line_items[0][price]':                     priceId,
      'line_items[0][quantity]':                  '1',
      success_url:                                `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url:                                 `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      // Session metadata (available on checkout.session.completed)
      'metadata[userId]':                         userId,
      'metadata[priceId]':                        priceId,
      'metadata[plan]':                           plan,
      'metadata[productLine]':                    productLine,
      // Subscription metadata (available on all subscription events)
      'subscription_data[metadata][userId]':      userId,
      'subscription_data[metadata][priceId]':     priceId,
      'subscription_data[metadata][plan]':        plan,
      'subscription_data[metadata][productLine]': productLine,
    }

    // Pre-fill the email on the Stripe Checkout form for smoother UX
    if (userEmail) {
      params['customer_email'] = userEmail
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    })

    const session = await stripeRes.json()

    if (!stripeRes.ok) {
      console.error('Stripe checkout creation failed', session.error)
      return NextResponse.json(
        { error: session.error?.message || 'Stripe error' },
        { status: 400 },
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
