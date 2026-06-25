import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// Maps our plan labels to the Stripe price env vars.
const WEBSITE_PRICES: Record<string, string | undefined> = {
  starter:  process.env.STRIPE_PRICE_WEBSITE_LAUNCH  ?? process.env.STRIPE_PRICE_WEBSITE_STARTER,
  pro:      process.env.STRIPE_PRICE_WEBSITE_GROWTH  ?? process.env.STRIPE_PRICE_WEBSITE_PRO,
  business: process.env.STRIPE_PRICE_WEBSITE_COMMAND ?? process.env.STRIPE_PRICE_WEBSITE_BUSINESS,
}
const PODCAST_PRICES: Record<string, string | undefined> = {
  indie:   process.env.STRIPE_PRICE_PODCAST_INDIE,
  pro:     process.env.STRIPE_PRICE_PODCAST_PRO,
  network: process.env.STRIPE_PRICE_PODCAST_NETWORK,
}

// Fetch a Stripe price (unit_amount in cents, interval) via raw API — no SDK needed.
async function fetchPrice(priceId: string | undefined): Promise<{ monthly: number } | null> {
  if (!priceId) return null
  try {
    const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const p = await res.json()
    const amount = (p.unit_amount || 0) / 100 // cents -> dollars
    const interval = p.recurring?.interval || 'month'
    // Normalize everything to a monthly figure for MRR.
    const monthly =
      interval === 'year' ? amount / 12 :
      interval === 'week' ? amount * 4.333 :
      interval === 'day'  ? amount * 30 :
      amount
    return { monthly }
  } catch {
    return null
  }
}

const ACTIVE = new Set(['active', 'trialing', 'past_due'])

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const admin = getAdminSupabase()

  // Pull all subscription rows (website + podcast columns live on the same row).
  const { data, error } = await admin
    .from('subscriptions')
    .select('plan, status, podcast_plan, podcast_status')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []

  // Resolve live monthly prices for every plan in parallel.
  const [
    wStarter, wPro, wBusiness, pIndie, pPro, pNetwork,
  ] = await Promise.all([
    fetchPrice(WEBSITE_PRICES.starter),
    fetchPrice(WEBSITE_PRICES.pro),
    fetchPrice(WEBSITE_PRICES.business),
    fetchPrice(PODCAST_PRICES.indie),
    fetchPrice(PODCAST_PRICES.pro),
    fetchPrice(PODCAST_PRICES.network),
  ])

  const priceFor = (line: 'website' | 'podcast', plan: string): number => {
    if (line === 'website') {
      if (plan === 'starter')  return wStarter?.monthly  || 0
      if (plan === 'pro')      return wPro?.monthly       || 0
      if (plan === 'business') return wBusiness?.monthly  || 0
    } else {
      if (plan === 'indie')    return pIndie?.monthly     || 0
      if (plan === 'pro')      return pPro?.monthly       || 0
      if (plan === 'network')  return pNetwork?.monthly   || 0
    }
    return 0
  }

  // Tally active subscriptions and MRR per line/plan.
  const breakdown: Record<string, { count: number; mrr: number }> = {}
  let totalMrr = 0
  let activeWebsite = 0
  let activePodcast = 0

  for (const r of rows as any[]) {
    if (r.plan && ACTIVE.has(String(r.status))) {
      const price = priceFor('website', r.plan)
      const key = `website:${r.plan}`
      breakdown[key] = breakdown[key] || { count: 0, mrr: 0 }
      breakdown[key].count += 1
      breakdown[key].mrr += price
      totalMrr += price
      activeWebsite += 1
    }
    if (r.podcast_plan && ACTIVE.has(String(r.podcast_status))) {
      const price = priceFor('podcast', r.podcast_plan)
      const key = `podcast:${r.podcast_plan}`
      breakdown[key] = breakdown[key] || { count: 0, mrr: 0 }
      breakdown[key].count += 1
      breakdown[key].mrr += price
      totalMrr += price
      activePodcast += 1
    }
  }

  // Flag if Stripe prices couldn't be read (so the UI can warn instead of showing $0 silently).
  const pricesResolved =
    [wStarter, wPro, wBusiness, pIndie, pPro, pNetwork].some(p => p && p.monthly > 0)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    pricesResolved,
    totals: {
      mrr: Math.round(totalMrr * 100) / 100,
      arr: Math.round(totalMrr * 12 * 100) / 100,
      activeWebsite,
      activePodcast,
      activeTotal: activeWebsite + activePodcast,
    },
    breakdown: Object.entries(breakdown)
      .map(([key, v]) => {
        const [line, plan] = key.split(':')
        return { line, plan, count: v.count, mrr: Math.round(v.mrr * 100) / 100 }
      })
      .sort((a, b) => b.mrr - a.mrr),
  })
}
