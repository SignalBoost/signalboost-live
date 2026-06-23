import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { normalizeTier } from '@/lib/video/subscription'

export const dynamic = 'force-dynamic'

const MAX_QUERY = 2000
// Hard cap on the raw request body, enforced BEFORE parsing. The largest
// legitimate payload is a 2000-char query plus a short locale, so 16 KB is
// generous headroom while still rejecting multi-megabyte bodies up front.
const MAX_BODY_BYTES = 16_000
const ALLOWED_LOCALES = new Set(['en', 'es', 'pt', 'pl', 'ru'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Best-effort, per-warm-instance rate limit. Serverless instances are ephemeral
// and not shared, so this is a soft ceiling per instance rather than a
// distributed guarantee — but it blunts trivial single-instance cost-exhaustion
// loops with zero external infrastructure. For a hard global limit, lift this
// into Redis/Upstash keyed the same way.
const RATE_MAX = 30
const RATE_WINDOW_MS = 60_000
const rateHits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (rateHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  rateHits.set(key, recent)
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(k)
    }
  }
  return recent.length > RATE_MAX
}

function bodyTooLarge(req: Request): boolean {
  const len = Number(req.headers.get('content-length') ?? '')
  return Number.isFinite(len) && len > MAX_BODY_BYTES
}

// Resolve entitlement context from SERVER state only. The client no longer
// supplies tier / usedMinutes / billingProvider — those are spoofable. Defaults
// to least privilege ('free') if no account/plan row is found.
async function resolveEntitlements(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
) {
  // userId originates from Supabase Auth and is expected to be a UUID. Validate
  // the shape before interpolating it into the PostgREST `.or()` filter so a
  // non-standard / imported identifier can never alter the filter expression
  // and match another account.
  if (!UUID_RE.test(userId)) {
    return { tier: 'free', billingProvider: 'stripe' as const }
  }

  try {
    const { data } = await supabase
      .from('accounts')
      .select('plan, tier, billing_provider') // data minimization — only what we need
      .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const row = (data ?? {}) as Record<string, unknown>
    // Allowlist the tier at this trust boundary. normalizeTier() maps any
    // unknown / mutated plan value down to least-privilege 'free' — the same
    // normalizer the real video export gate uses, so the concierge can never
    // report a higher allowance than the gate would actually grant.
    const tier = normalizeTier((row.plan ?? row.tier) as string | null | undefined)
    const billingProvider = row.billing_provider === 'paypal' ? 'paypal' : 'stripe'
    return { tier, billingProvider: billingProvider as 'stripe' | 'paypal' }
  } catch {
    return { tier: 'free', billingProvider: 'stripe' as const }
  }
}

export async function POST(req: Request) {
  if (bodyTooLarge(req)) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (rateLimited(`concierge:${user.id}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
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
