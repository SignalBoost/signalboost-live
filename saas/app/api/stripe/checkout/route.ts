import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

// ─── Audit-module checkout ────────────────────────────────────────────────────
// The audit pricing page (/dashboard/audit/pricing) resolves a Stripe price id
// client-side from NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* and POSTs { priceId } here.
// We accept ONLY the known audit price ids (allowlist) so an arbitrary price can
// never be checked out through this route, then create a subscription Checkout
// Session — same mechanics as /api/checkout.
//
// Required env (set in Vercel):
//   STRIPE_SECRET_KEY                       (already set — used by /api/checkout)
//   NEXT_PUBLIC_APP_URL                     (already set)
//   NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER  (price_… for the $29 audit plan)
//   NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO      (price_… for the $79 audit plan)

function auditPriceAllowlist(): string[] {
  return [
    process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const priceId: string = String(body?.priceId || '')

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId.' }, { status: 400 })
    }

    const allowlist = auditPriceAllowlist()
    if (allowlist.length === 0) {
      // The env vars have not been set yet — the page shows its own
      // "not configured" notice, but guard the server side too.
      console.error('Audit checkout: no NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* env vars set')
      return NextResponse.json({ error: 'Audit pricing is not configured yet.' }, { status: 503 })
    }
    if (!allowlist.includes(priceId)) {
      console.error('Audit checkout: priceId not in audit allowlist', priceId)
      return NextResponse.json({ error: 'Invalid price.' }, { status: 400 })
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
        { error: 'You must be signed in to subscribe.' },
        { status: 401 },
      )
    }

    const userId    = user.id
    const userEmail = user.email || ''

    // ── Build Stripe Checkout Session params ─────────────────────────────────
    const params: Record<string, string> = {
      mode:                                  'subscription',
      'payment_method_types[0]':             'card',
      'line_items[0][price]':                priceId,
      'line_items[0][quantity]':             '1',
      success_url:                           `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/audit?success=true`,
      cancel_url:                            `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/audit/pricing?cancelled=true`,
      'metadata[userId]':                    userId,
      'metadata[priceId]':                   priceId,
      'metadata[productLine]':               'audit',
      'subscription_data[metadata][userId]': userId,
      'subscription_data[metadata][priceId]': priceId,
      'subscription_data[metadata][productLine]': 'audit',
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
      console.error('Audit Stripe checkout creation failed', session?.error)
      return NextResponse.json(
        { error: session?.error?.message || 'Stripe error' },
        { status: 400 },
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Audit checkout route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
