import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

export const dynamic = 'force-dynamic'

const MAX_QUERY = 2000
const ALLOWED_LOCALES = new Set(['en', 'es', 'pt', 'pl', 'ru'])

// Resolve entitlement context from SERVER state only. The client no longer
// supplies tier / usedMinutes / billingProvider — those are spoofable. Defaults
// to least privilege ('free') if no account/plan row is found.
async function resolveEntitlements(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
) {
  try {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const row = (data ?? {}) as Record<string, unknown>
    const tier = String(row.plan ?? row.tier ?? 'free')
    const billingProvider = row.billing_provider === 'paypal' ? 'paypal' : 'stripe'
    return { tier, billingProvider: billingProvider as 'stripe' | 'paypal' }
  } catch {
    return { tier: 'free', billingProvider: 'stripe' as const }
  }
}

export async function POST(req: Request) {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawQuery = (body as any).query
  if (typeof rawQuery !== 'string') {
    return NextResponse.json({ error: 'query must be a string' }, { status: 400 })
  }
  const query = rawQuery.trim()
  if (query.length === 0 || query.length > MAX_QUERY) {
    return NextResponse.json({ error: `query must be 1–${MAX_QUERY} characters` }, { status: 400 })
  }

  const rawLocale =
    typeof (body as any).locale === 'string' ? (body as any).locale.toLowerCase().slice(0, 2) : 'en'
  const locale = ALLOWED_LOCALES.has(rawLocale) ? rawLocale : 'en'

  // Entitlements derived server-side. usedMinutes is advisory here (the real
  // export gate lives in the video routes) and fixed to 0 so the concierge can
  // never be tricked into reporting a higher allowance.
  const { tier, billingProvider } = await resolveEntitlements(supabase, user.id)

  return NextResponse.json(
    answerSignalBoostConcierge(query, locale, { tier, usedMinutes: 0, billingProvider }),
  )
}

// Public, static module catalog. No per-account entitlement context and no
// client-controlled options, so it is safe to expose unauthenticated. Cached.
export async function GET() {
  return NextResponse.json(
    answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'),
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  )
}
