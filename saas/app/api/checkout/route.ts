import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'

export const dynamic = 'force-dynamic'

type ProductLine = 'platform' | 'podcast'
type CheckoutPlan = { internalPlan: string; priceId: string | undefined; expectedMonthlyCents: number }

function resolvePlan(productLine: ProductLine, requestedPlan: string): CheckoutPlan | null {
  const platform: Record<string, CheckoutPlan> = {
    launch: { internalPlan: 'starter', priceId: process.env.STRIPE_PRICE_WEBSITE_LAUNCH ?? process.env.STRIPE_PRICE_WEBSITE_STARTER, expectedMonthlyCents: 1500 },
    growth: { internalPlan: 'pro', priceId: process.env.STRIPE_PRICE_WEBSITE_GROWTH ?? process.env.STRIPE_PRICE_WEBSITE_PRO, expectedMonthlyCents: 9900 },
    command: { internalPlan: 'business', priceId: process.env.STRIPE_PRICE_WEBSITE_COMMAND ?? process.env.STRIPE_PRICE_WEBSITE_BUSINESS, expectedMonthlyCents: 24900 },
  }
  const podcast: Record<string, CheckoutPlan> = {
    indie: { internalPlan: 'indie', priceId: process.env.STRIPE_PRICE_PODCAST_INDIE, expectedMonthlyCents: 2900 },
    pro: { internalPlan: 'pro', priceId: process.env.STRIPE_PRICE_PODCAST_PRO, expectedMonthlyCents: 7900 },
    network: { internalPlan: 'network', priceId: process.env.STRIPE_PRICE_PODCAST_NETWORK, expectedMonthlyCents: 29900 },
  }
  return (productLine === 'podcast' ? podcast : platform)[requestedPlan] ?? null
}

async function priceMatchesCatalog(priceId: string, expectedMonthlyCents: number): Promise<boolean> {
  const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    cache: 'no-store',
  })
  if (!response.ok) return false
  const price = await response.json()
  return price.active === true && price.currency === 'usd' && price.unit_amount === expectedMonthlyCents && price.recurring?.interval === 'month'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const requestedPlan = String(body?.plan || '').toLowerCase()
    const productLine: ProductLine = body?.productLine === 'podcast' ? 'podcast' : 'platform'
    const selected = resolvePlan(productLine, requestedPlan)

    if (!selected?.priceId) return NextResponse.json({ error: 'Pricing is not configured for this plan.' }, { status: 503 })

    const cookieStore = await cookies()
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* Server Component */ }
        },
      },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user?.id) return NextResponse.json({ error: 'You must be signed in to subscribe.' }, { status: 401 })
    if (!process.env.STRIPE_SECRET_KEY || !await priceMatchesCatalog(selected.priceId, selected.expectedMonthlyCents)) {
      console.error('Checkout blocked: Stripe price does not match the public catalog', { productLine, requestedPlan })
      return NextResponse.json({ error: 'This plan is temporarily unavailable while pricing is updated.' }, { status: 503 })
    }

    const stripeProductLine = productLine === 'platform' ? 'website' : 'podcast'
    const params: Record<string, string> = {
      mode: 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': selected.priceId,
      'line_items[0][quantity]': '1',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      'metadata[userId]': user.id,
      'metadata[priceId]': selected.priceId,
      'metadata[plan]': selected.internalPlan,
      'metadata[productLine]': stripeProductLine,
      'subscription_data[metadata][userId]': user.id,
      'subscription_data[metadata][priceId]': selected.priceId,
      'subscription_data[metadata][plan]': selected.internalPlan,
      'subscription_data[metadata][productLine]': stripeProductLine,
    }
    if (user.email) params.customer_email = user.email

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    const session = await stripeResponse.json()
    if (!stripeResponse.ok || !session?.url) {
      console.error('Stripe checkout creation failed', session?.error)
      return NextResponse.json({ error: session?.error?.message || 'Stripe checkout failed.' }, { status: 400 })
    }
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Checkout route error', error)
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 })
  }
}
