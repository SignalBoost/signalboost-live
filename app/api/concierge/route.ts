import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { normalizeTier } from '@/lib/video/subscription'
import { readJsonLimited } from '@/lib/http/readJsonLimited'
import { rateLimited } from '@/lib/http/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_QUERY = 2000
// Hard cap on the raw request body. The largest legitimate payload is a
// 2000-char query plus a short locale, so 16 KB is generous headroom while
// still rejecting multi-megabyte bodies. Enforced by readJsonLimited while the
// stream is consumed, so it holds even when Content-Length is missing/false.
const MAX_BODY_BYTES = 16_000
const ALLOWED_LOCALES = new Set(['en', 'es', 'pt', 'pl', 'ru'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rate limit via the shared limiter: distributed (Upstash) when configured,
// otherwise a soft per-instance ceiling. Keyed by authenticated user id.
const RATE_MAX = 30
const RATE_WINDOW_MS = 60_000

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
      // Prefer the MOST RECENT account row. The oldest row can be a stale or
      // superseded plan; the newest reflects the current account state. We
      // still normalize the tier below, so a worst case maps down to 'free'
      // rather than over-reporting an allowance.
      .order('created_at', { ascending: false })
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
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (await rateLimited(`concierge:${user.id}`, { max: RATE_MAX, windowMs: RATE_WINDOW_MS })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Hardened read: exact JSON media type + a hard byte ceiling enforced while
  // the stream is consumed (Content-Length is advisory, not trusted).
  const parsed = await readJsonLimited<Record<string, unknown>>(req, {
    maxBytes: MAX_BODY_BYTES,
  })
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const body = parsed.value
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawQuery = (body as Record<string, unknown>).query
  if (typeof rawQuery !== 'string') {
    return NextResponse.json({ error: 'query must be a string' }, { status: 400 })
  }
  const query = rawQuery.trim()
  if (query.length === 0 || query.length > MAX_QUERY) {
    return NextResponse.json({ error: `query must be 1–${MAX_QUERY} characters` }, { status: 400 })
  }

  const rawLocaleValue = (body as Record<string, unknown>).locale
  const rawLocale =
    typeof rawLocaleValue === 'string' ? rawLocaleValue.toLowerCase().slice(0, 2) : 'en'
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
