// saas/app/api/stripe/render-topup/route.ts
// Render-credit pack top-up (ONE-TIME payment). Mirror of /api/stripe/audit-topup.
// Client POSTs only a pack id ({ pack: 'small' | 'medium' | 'large' }) — never an
// amount. Credits are server-fixed here so a tampered request can't mint balance.
// 1 credit = 1 US cent of provider cost * markup (see lib/credits/renderCredits).
//
// On checkout.session.completed the webhook's render_credit_topup branch calls
// increment_render_credits to add credits atomically to subscriptions.render_credits.
//
// Required env (set in Vercel):
//   STRIPE_SECRET_KEY                  (already set)
//   NEXT_PUBLIC_APP_URL                (already set)
//   STRIPE_PRICE_RENDER_TOPUP_SMALL    (one-time price id — Small pack)
//   STRIPE_PRICE_RENDER_TOPUP_MEDIUM   (one-time price id — Medium pack)
//   STRIPE_PRICE_RENDER_TOPUP_LARGE    (one-time price id — Large pack)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

type PackId = 'small' | 'medium' | 'large'

interface TopupPack {
  credits: number
  priceEnvKey: string
}

// Credits = cents of user value. With 3x markup, 1500 credits ≈ $5 of provider
// render capacity. Prices are set on the Stripe price ids in Vercel env.
const TOPUP_PACKS: Record<PackId, TopupPack> = {
  small:  { credits: 1500,  priceEnvKey: 'STRIPE_PRICE_RENDER_TOPUP_SMALL'  },
  medium: { credits: 4500,  priceEnvKey: 'STRIPE_PRICE_RENDER_TOPUP_MEDIUM' },
  large:  { credits: 15000, priceEnvKey: 'STRIPE_PRICE_RENDER_TOPUP_LARGE'  },
}

function isPackId(v: string): v is PackId {
  return v === 'small' || v === 'medium' || v === 'large'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const pack: string = String(body?.pack || '').toLowerCase()

    if (!pack) return NextResponse.json({ error: 'Missing pack.' }, { status: 400 })
    if (!isPackId(pack)) return NextResponse.json({ error: 'Invalid pack.' }, { status: 400 })

    const config = TOPUP_PACKS[pack]
    const priceId = process.env[config.priceEnvKey] || ''
    if (!priceId) {
      console.error('Render top-up: price env not set for pack', pack, config.priceEnvKey)
      return NextResponse.json({ error: 'Credit packs are not configured yet.' }, { status: 503 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: saasSupabaseCookieOptions,
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch { /* Server Component — ignore */ }
          },
        },
      },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user?.id) {
      return NextResponse.json({ error: 'You must be signed in to buy credits.' }, { status: 401 })
    }

    const userId = user.id
    const userEmail = user.email || ''
    const credits = config.credits

    const params: Record<string, string> = {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/agency?topup=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/agency?topup=cancelled`,
      'metadata[type]': 'render_credit_topup',
      'metadata[userId]': userId,
      'metadata[priceId]': priceId,
      'metadata[pack]': pack,
      'metadata[creditAmount]': String(credits),
      'payment_intent_data[metadata][type]': 'render_credit_topup',
      'payment_intent_data[metadata][userId]': userId,
      'payment_intent_data[metadata][creditAmount]': String(credits),
    }
    if (userEmail) params['customer_email'] = userEmail

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    })

    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      console.error('Render top-up Stripe checkout creation failed', session?.error)
      return NextResponse.json({ error: session?.error?.message || 'Stripe error' }, { status: 400 })
    }

    console.log('Render top-up: session created', { sessionId: session.id, userId, pack, credits })
    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Render top-up route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
