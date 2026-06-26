import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { normalizeTier } from '@/lib/video/subscription'
import { readJsonLimited } from '@/lib/http/readJsonLimited'
import { rateLimited } from '@/lib/http/rateLimit'
import { clientIpKey } from '@/lib/http/clientIp'
import { sameOriginOk } from '@/lib/http/sameOrigin'

export const dynamic = 'force-dynamic'

const MAX_QUERY = 2000
// Hard cap on the raw request body. The largest legitimate payload is a
// 2000-char query plus a short locale, so 16 KB is generous headroom while
// still rejecting multi-megabyte bodies. Enforced by readJsonLimited while the
// stream is consumed, so it holds even when Content-Length is missing/false.
const MAX_BODY_BYTES = 16_000
const ALLOWED_LOCALES = new Set(['en', 'es', 'pt', 'pl', 'ru'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENTITLEMENT_NULL_END_GRACE_MS = 30 * 60_000

// Rate limit via the shared limiter: distributed (Upstash) when configured,
// otherwise a soft per-instance ceiling. Keyed by authenticated user id.
const RATE_MAX = 30
const RATE_WINDOW_MS = 60_000

function subscriptionIsCurrentlyValid(row: Record<string, unknown>, now: number): boolean {
  const periodEnd = row.current_period_ends_at as string | null | undefined
  if (periodEnd) {
    const parsedEnd = Date.parse(periodEnd)
    return Number.isFinite(parsedEnd) && parsedEnd > now
  }

  // Missing period ends are tolerated only as a very short checkout/write-race
  // grace period, never indefinitely. Future-dated rows fail closed as malformed.
  const createdAt = row.created_at as string | null | undefined
  const parsedCreated = createdAt ? Date.parse(createdAt) : NaN
  const ageMs = Number.isFinite(parsedCreated) ? now - parsedCreated : NaN
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ENTITLEMENT_NULL_END_GRACE_MS
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

  // AUTHORITATIVE tier: gate on a currently-valid subscription (active/trialing)
  // using database-side validity filters. This avoids the previous pattern of
  // looking only at the newest few active/trialing rows, where several newer
  // stale/malformed rows could hide an older still-valid entitlement.
  let tier = 'free'
  try {
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const graceStartIso = new Date(now - ENTITLEMENT_NULL_END_GRACE_MS).toISOString()

    const { data: periodRows } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_ends_at, created_at')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .gt('current_period_ends_at', nowIso)
      .order('current_period_ends_at', { ascending: false })
      .limit(1)

    const { data: graceRows } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_ends_at, created_at')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .is('current_period_ends_at', null)
      .gte('created_at', graceStartIso)
      .lte('created_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)

    const candidates = [
      ...(Array.isArray(periodRows) ? periodRows : []),
      ...(Array.isArray(graceRows) ? graceRows : []),
    ] as Record<string, unknown>[]

    const valid = candidates.find(row => subscriptionIsCurrentlyValid(row, now))
    if (valid) {
      // normalizeTier() maps any unknown/mutated plan value down to 'free' — the
      // same normalizer the export gate uses, so we can't over-report a tier.
      tier = normalizeTier(valid.plan as string | null | undefined)
    }
  } catch {
    tier = 'free'
  }

  // Billing provider is a display/routing hint for overage copy only — NOT an
  // access gate — so it's read best-effort from accounts (subscriptions doesn't
  // carry it) and defaults to 'stripe' when unavailable. userId is UUID-validated
  // above before being interpolated into the `.or()` filter.
  let billingProvider: 'stripe' | 'paypal' = 'stripe'
  try {
    const { data } = await supabase
      .from('accounts')
      .select('billing_provider')
      .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data && (data as Record<string, unknown>).billing_provider === 'paypal') {
      billingProvider = 'paypal'
    }
  } catch {
    billingProvider = 'stripe'
  }

  return { tier, billingProvider }
}

function currentUtcMonthStart(nowMs = Date.now()): Date {
  const now = new Date(nowMs)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function nextUtcMonthStart(nowMs = Date.now()): Date {
  const now = new Date(nowMs)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

function usageCacheKey(userId: string, monthStartIso: string) {
  return `${userId}:${monthStartIso}`
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
  monthStartIso: string,
  signal?: AbortSignal,
): Promise<number | null> {
  // A malformed (non-UUID) id is "unknown" usage, not a verified 0. Returning
  // null flags usageUnavailable downstream instead of presenting a false
  // 0-used state (which would suppress a due overage warning) should non-UUID
  // identities ever reach this path. UUID-shaped ids proceed to the real sum.
  if (!UUID_RE.test(userId)) return null
  const PAGE = 1000
  const MAX_PAGES = 50 // 50k export rows/month ceiling — far beyond any real use
  try {
    let totalSeconds = 0
    let complete = false
    for (let page = 0; page < MAX_PAGES; page++) {
      const fromIdx = page * PAGE
      const builder = supabase
        .from('video_jobs')
        .select('duration_seconds')
        .eq('user_id', userId)
        .eq('job_type', 'export')
        .gte('created_at', monthStartIso)
        .order('created_at', { ascending: true })
        .range(fromIdx, fromIdx + PAGE - 1)
      const { data, error } = signal
        ? await builder.abortSignal(signal)
        : await builder
      if (error) return null // explicit unknown — never fabricate 0 on error
      if (!Array.isArray(data) || data.length === 0) {
        complete = true
        break
      }
      totalSeconds += data.reduce(
        (sum, row) => {
          const n = Number((row as Record<string, unknown>).duration_seconds)
          return sum + (Number.isFinite(n) && n > 0 ? n : 0)
        },
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
    return null // explicit unknown, including abort/timeout
  }
}

async function resolveUsedMinutesWithTimeout(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
  monthStartIso: string,
): Promise<number | null> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  const timedOut = new Promise<null>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, USAGE_LOOKUP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      resolveUsedMinutes(supabase, userId, monthStartIso, controller.signal),
      timedOut,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

// Short-TTL per-user/month cache for the monthly usage figure. Without it, a
// high-rate authenticated caller could force resolveUsedMinutes' paginated reads
// on every POST. Cache keys include the UTC month start so values computed just
// before a month boundary cannot leak into the next month.
const USAGE_TTL_MS = 60_000
const USAGE_LOOKUP_TIMEOUT_MS = 5_000
// Hard cap on distinct cached users/months per instance.
const USAGE_CACHE_MAX = 5000
const USAGE_INFLIGHT_MAX = 500
const usageCache = new Map<string, { value: number | null; expires: number }>()
const usageInflight = new Map<string, Promise<number | null>>()

function pruneUsageCache(now: number) {
  if (usageCache.size <= USAGE_CACHE_MAX) return
  // Purge expired first (cheap), then evict oldest until under the hard cap.
  for (const [k, v] of usageCache) {
    if (v.expires <= now) usageCache.delete(k)
  }
  while (usageCache.size > USAGE_CACHE_MAX) {
    const oldest = usageCache.keys().next().value
    if (oldest === undefined) break
    usageCache.delete(oldest)
  }
}

async function resolveUsedMinutesCached(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
): Promise<number | null> {
  const now = Date.now()
  const monthStartIso = currentUtcMonthStart(now).toISOString()
  const monthEndMs = nextUtcMonthStart(now).getTime()
  const cacheKey = usageCacheKey(userId, monthStartIso)
  const hit = usageCache.get(cacheKey)
  if (hit && hit.expires > now) {
    // Touch: re-insert to mark most-recently-used (Map keeps insertion order).
    usageCache.delete(cacheKey)
    usageCache.set(cacheKey, hit)
    return hit.value
  }
  if (hit) usageCache.delete(cacheKey) // stale

  const existing = usageInflight.get(cacheKey)
  if (existing) return existing

  // Bound retained in-flight work. If many distinct accounts arrive while the DB
  // is slow, degrade to usageUnavailable rather than retaining unbounded promises.
  if (usageInflight.size >= USAGE_INFLIGHT_MAX) return null

  const pending = resolveUsedMinutesWithTimeout(supabase, userId, monthStartIso)
    .then(value => {
      const finishedAt = Date.now()
      usageCache.set(cacheKey, {
        value,
        expires: Math.min(finishedAt + USAGE_TTL_MS, monthEndMs),
      })
      pruneUsageCache(finishedAt)
      return value
    })
    .finally(() => {
      usageInflight.delete(cacheKey)
    })

  usageInflight.set(cacheKey, pending)
  return pending
}

export async function POST(req: Request) {
  // CSRF defense FIRST: reject cookie-authenticated POSTs that aren't
  // same-origin before any auth lookup or per-user rate-limit mutation. A
  // cross-origin browser request carries the victim's cookies, so if this ran
  // after the per-user limiter it would let an attacker page burn the victim's
  // concierge quota (CSRF-driven DoS) before the request was rejected.
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
  }

  // Coarse PRE-AUTH throttle, before the Supabase client / getUser() lookup.
  // sameOriginOk alone is not abuse control: an originless or non-browser client
  // can pass it, then repeatedly drive auth/session processing and upstream
  // Supabase calls without ever reaching the per-user limiter (those requests
  // 401 instead). The per-IP fair-use limit runs FIRST so a single abusive
  // client is rejected by its own bucket and never consumes the shared global
  // backstop — the global limit then only counts requests that survived per-IP,
  // protecting other users from one client draining it. (Coarse abuse control
  // belongs at the CDN/WAF; this is a last-resort origin guard.)
  if (await rateLimited(`concierge-post:${clientIpKey(req)}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  if (await rateLimited('concierge-post:global', { max: 3000, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

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
  const usedMinutes = await resolveUsedMinutesCached(supabase, user.id)

  return NextResponse.json(
    answerSignalBoostConcierge(query, locale, {
      tier,
      billingProvider,
      // Unknown usage is transmitted as undefined (not a fabricated 0) so the
      // data model never asserts "0 minutes used" for an unverified figure.
      // usageUnavailable is the explicit signal downstream must honor; the
      // concierge already gates overage guidance on it rather than on a value.
      usedMinutes: usedMinutes ?? undefined,
      usageUnavailable: usedMinutes === null,
    }),
  )
}

// Public, static module catalog. No per-account entitlement context and no
// client-controlled options. Cached at the edge, but cache headers only help
// when intermediaries honor them — so we also apply a per-IP rate limit to
// protect the origin from repeated uncached execution.
export async function GET(req: Request) {
  // Per-IP fair-use limit FIRST, keyed on a validated/bounded client IP, so a
  // single misbehaving client is rejected by its own 60/min bucket and never
  // consumes the shared global backstop.
  if (await rateLimited(`concierge-get:${clientIpKey(req)}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  // Coarse GLOBAL backstop, sized well above aggregate legitimate (mostly
  // edge-cached) origin traffic. It only counts requests that survived the
  // per-IP limit above, and trips only on extreme runaway/distributed load as a
  // last-resort origin guard. Primary abuse control belongs at the edge/WAF/CDN.
  if (await rateLimited('concierge-get:global', { max: 6000, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return NextResponse.json(
    answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'),
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  )
}
