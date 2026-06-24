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

// Authoritative used-minutes for the current calendar month, summed server-side
// from this (marketing) project's own `video_jobs` ledger — the same table the
// video export route writes. Same project + same auth user id as the concierge,
// so no cross-project identity mapping is needed. Runs in its own try/catch and
// returns 0 on any failure, so a usage-query problem can never strip the user's
// resolved tier and never invents minutes the user hasn't used.
async function resolveUsedMinutes(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
): Promise<number> {
  if (!UUID_RE.test(userId)) return 0
  try {
    const now = new Date()
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()
    const { data } = await supabase
      .from('video_jobs')
      .select('duration_seconds')
      .eq('user_id', userId)
      .eq('job_type', 'export')
      .gte('created_at', monthStart)
      .limit(5000)
    if (!Array.isArray(data)) return 0
    const seconds = data.reduce(
      (sum, row) => sum + (Number((row as Record<string, unknown>).duration_seconds) || 0),
      0,
    )
    return Math.ceil(seconds / 60)
  } catch {
    return 0
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
  // the client never supplies it), so the concierge's quota/overage guidance
  // matches what the user has actually consumed. Both lookups degrade safely to
  // least-privilege / zero on failure.
  const { tier, billingProvider } = await resolveEntitlements(supabase, user.id)
  const usedMinutes = await resolveUsedMinutes(supabase, user.id)

  return NextResponse.json(
    answerSignalBoostConcierge(query, locale, { tier, usedMinutes, billingProvider }),
  )
}

// Public, static module catalog. No per-account entitlement context and no
// client-controlled options. Cached at the edge, but cache headers only help
// when intermediaries honor them — so we also apply a per-IP rate limit to
// protect the origin from repeated uncached execution.
export async function GET(req: Request) {
  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (await rateLimited(`concierge-get:${ip}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return NextResponse.json(
    answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'),
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  )
}
