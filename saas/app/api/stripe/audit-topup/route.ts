import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

// ─── Audit credit-pack top-up checkout (ONE-TIME payment) ─────────────────────
// Companion to /api/stripe/checkout (which sells the recurring audit plans).
// This route sells one-off credit packs. The client POSTs only a pack id
// ({ pack: 'small' | 'medium' | 'large' }) — it NEVER sends the credit amount.
// The amount is fixed SERVER-SIDE in TOPUP_PACKS so a tampered request can never
// buy a small pack and claim a large credit grant. We create a mode:'payment'
// Checkout Session and stamp the metadata the webhook reads:
//     metadata.type         = 'audit_credit_topup'   (webhook discriminator)
//     metadata.userId       = buyer's Supabase auth id
//     metadata.creditAmount = server-fixed credits for the pack
// On checkout.session.completed the webhook calls increment_audit_credits to add
// those credits atomically to subscriptions.audit_credits.
//
// Required env (set in Vercel):
//   STRIPE_SECRET_KEY                  (already set)
//   NEXT_PUBLIC_APP_URL                (already set)
//   STRIPE_PRICE_AUDIT_TOPUP_SMALL     (one-time price id for the Small pack)
//   STRIPE_PRICE_AUDIT_TOPUP_MEDIUM    (one-time price id for the Medium pack)
//   STRIPE_PRICE_AUDIT_TOPUP_LARGE     (one-time price id for the Large pack)
// These are server-only (NOT NEXT_PUBLIC) — the client only ever sends a pack id.

type PackId = 'small' | 'medium' | 'large'

interface TopupPack {
  credits: number       // server-authoritative; written to metadata.creditAmount
  priceEnvKey: string   // env var holding this pack's one-time Stripe price id
}

const TOPUP_PACKS: Record<PackId, TopupPack> = {
  small:  { credits: 50,  priceEnvKey: 'STRIPE_PRICE_AUDIT_TOPUP_SMALL'  },
  medium: { credits: 150, priceEnvKey: 'STRIPE_PRICE_AUDIT_TOPUP_MEDIUM' },
  large:  { credits: 500, priceEnvKey: 'STRIPE_PRICE_AUDIT_TOPUP_LARGE'  },
}

function isPackId(v: string): v is PackId {
  return v === 'small' || v === 'medium' || v === 'large'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const pack: string = String(body?.pack || '').toLowerCase()

    if (!pack) {
      return NextResponse.json({ error: 'Missing pack.' }, { status: 400 })
    }
    if (!isPackId(pack)) {
      return NextResponse.json({ error: 'Invalid pack.' }, { status: 400 })
    }

    const config = TOPUP_PACKS[pack]
    const priceId = process.env[config.priceEnvKey] || ''
    if (!priceId) {
      console.error('Audit top-up: price env not set for pack', pack, config.priceEnvKey)
      return NextResponse.json(
        { error: 'Credit packs are not configured yet.' },
        { status: 503 },
      )
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
      return NextResponse.json(
        { error: 'You must be signed in to buy credits.' },
        { status: 401 },
      )
    }

    const userId    = user.id
    const userEmail = user.email || ''
    const credits   = config.credits

    // ── Build Stripe Checkout Session params (ONE-TIME payment) ──────────────
    const params: Record<string, string> = {
      mode:                      'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price]':    priceId,
      'line_items[0][quantity]': '1',
      success_url:               `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/audit?topup=success`,
      cancel_url:                `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/audit?topup=cancelled`,
      // Metadata the webhook's audit_credit_topup branch reads.
      'metadata[type]':          'audit_credit_topup',
      'metadata[userId]':        userId,
      'metadata[priceId]':       priceId,
      'metadata[pack]':          pack,
      'metadata[creditAmount]':  String(credits),
      // Mirror onto the PaymentIntent too, so the data survives anywhere the
      // session object is not the one inspected.
      'payment_intent_data[metadata][type]':         'audit_credit_topup',
      'payment_intent_data[metadata][userId]':       userId,
      'payment_intent_data[metadata][creditAmount]': String(credits),
    }

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
      console.error('Audit top-up Stripe checkout creation failed', session?.error)
      return NextResponse.json(
        { error: session?.error?.message || 'Stripe error' },
        { status: 400 },
      )
    }

    console.log('Audit top-up: session created', { sessionId: session.id, userId, pack, credits })
    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Audit top-up route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
