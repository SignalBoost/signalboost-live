import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { normalizeTier } from '@/lib/video/subscription'
import { readJsonLimited } from '@/lib/http/readJsonLimited'
import { rateLimited } from '@/lib/http/rateLimit'
import { clientIpKey } from '@/lib/http/clientIp'

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

// Authoritative used-minutes for the current calendar month, summed server-side
// from this (marketing) project's own `video_jobs` ledger — the same table the
// video export route writes. Same project + same auth user id as the concierge,
// so no cross-project identity mapping is needed.
//
// Returns the real total when the query succeeds (paginated up to a very high
// page ceiling; if that ceiling is somehow exceeded it returns unknown rather
// than a truncated undercount), or null when usage can't be determined
// (transient DB/RLS error). null is "unknown", deliberately distinct from 0 used:
// the caller must NOT present a 0-used quota it didn't actually verify, which
// would understate consumption and suppress an overage warning that's due.
async function resolveUsedMinutes(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
): Promise<number | null> {
  // A malformed id maps to no account → genuinely 0 used (not "unknown").
  if (!UUID_RE.test(userId)) return 0
  const PAGE = 1000
  const MAX_PAGES = 50 // 50k export rows/month ceiling — far beyond any real use
  try {
    const now = new Date()
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()
    let totalSeconds = 0
    let complete = false
    for (let page = 0; page < MAX_PAGES; page++) {
      const fromIdx = page * PAGE
      const { data, error } = await supabase
        .from('video_jobs')
        .select('duration_seconds')
        .eq('user_id', userId)
        .eq('job_type', 'export')
        .gte('created_at', monthStart)
        .order('created_at', { ascending: true })
        .range(fromIdx, fromIdx + PAGE - 1)
      if (error) return null // explicit unknown — never fabricate 0 on error
      if (!Array.isArray(data) || data.length === 0) {
        complete = true
        break
      }
      totalSeconds += data.reduce(
        (sum, row) => sum + (Number((row as Record<string, unknown>).duration_seconds) || 0),
        0,
      )
      if (data.length < PAGE) {
        complete = true
        break
      }
    }
    // If the loop exhausted the page ceiling while still returning full pages,
    // there may be more rows we never summed — report unknown rather than an
    // understated partial total.
    if (!complete) return null
    return Math.ceil(totalSeconds / 60)
  } catch {
    return null // explicit unknown
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

  // Entitlements + real usage derived server-side. usedMinutes is summed from
  // this project's own video_jobs ledger for the current month (unspoofable —
  // the client never supplies it). When usage can't be determined we flag it
  // (usageUnavailable) so the concierge gives neutral guidance instead of a
  // 0-used quota it didn't verify. Tier still degrades safely to least-privilege.
  const { tier, billingProvider } = await resolveEntitlements(supabase, user.id)
  const usedMinutes = await resolveUsedMinutes(supabase, user.id)

  return NextResponse.json(
    answerSignalBoostConcierge(query, locale, {
      tier,
      billingProvider,
      usedMinutes: usedMinutes ?? 0,
      usageUnavailable: usedMinutes === null,
    }),
  )
}

// Public, static module catalog. No per-account entitlement context and no
// client-controlled options. Cached at the edge, but cache headers only help
// when intermediaries honor them — so we also apply a per-IP rate limit to
// protect the origin from repeated uncached execution.
export async function GET(req: Request) {
  // Coarse GLOBAL backstop. This is NOT the primary abuse control — that belongs
  // at the edge/WAF/CDN. It's sized well above aggregate legitimate (mostly
  // edge-cached) origin traffic so a single misbehaving client — bounded to 60/
  // min by the per-IP limit below — can't exhaust it and 429 everyone; it only
  // trips on extreme runaway load as a last-resort origin guard.
  if (await rateLimited('concierge-get:global', { max: 6000, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  // Per-IP fair-use limit, keyed on a validated/bounded client IP.
  if (await rateLimited(`concierge-get:${clientIpKey(req)}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return NextResponse.json(
    answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'),
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  )
}
