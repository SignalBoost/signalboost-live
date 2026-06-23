// app/api/brand-profile/route.ts
// Per-user brand profile, RLS-scoped — a user can only read/write their own.
// Hardened:
//   • POST verifies Origin/Referer against a configured canonical-ORIGIN
//     allowlist (env APP_ALLOWED_ORIGINS) — full scheme+host+port, NOT host
//     alone, so http://… can never satisfy an https://… policy.
//   • Request body is enforced by a hard byte ceiling while the stream is read
//     (Content-Length is advisory and not trusted on its own).
//   • Malformed JSON is rejected with 400 instead of silently overwriting {}.
//   • Payload must be a plain object within strict size / key limits.
//   • Per-user responses are marked no-store, private.

import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { readJsonLimited } from '@/lib/http/readJsonLimited'

const MAX_PROFILE_BYTES = 100_000
const MAX_PROFILE_KEYS = 200

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

// Canonical ORIGINS this API trusts for state-changing requests. Configure via
// APP_ALLOWED_ORIGINS (comma-separated) in Vercel; falls back to the known
// production marketing domains. Stored as full origins (scheme + host + port)
// so the scheme is part of the comparison — http and https are distinct.
const CANONICAL_ORIGINS = (
  process.env.APP_ALLOWED_ORIGINS ||
  'https://signalboostapp.com,https://www.signalboostapp.com'
)
  .split(',')
  .map((entry) => {
    try {
      return new URL(entry.trim()).origin.toLowerCase()
    } catch {
      return ''
    }
  })
  .filter(Boolean)

function sameOriginOk(req: Request): boolean {
  const candidate = req.headers.get('origin') || req.headers.get('referer')
  if (!candidate) return false // state-changing browser fetches always send Origin

  let candidateOrigin: string
  try {
    candidateOrigin = new URL(candidate).origin.toLowerCase()
  } catch {
    return false
  }

  // 1) Primary check: candidate origin (scheme + host + port) must match a
  //    configured canonical origin exactly.
  if (CANONICAL_ORIGINS.includes(candidateOrigin)) return true

  // 2) Narrow fallback for Vercel preview deployments only, where Origin and
  //    Host legitimately match a platform-controlled *.vercel.app host over
  //    https. This is not "trust the Host header" — it is gated to a single
  //    trusted suffix and an https scheme.
  const reqHost = (req.headers.get('host') || '').toLowerCase()
  if (reqHost.endsWith('.vercel.app') && candidateOrigin === `https://${reqHost}`) {
    return true
  }

  return false
}

function validProfile(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as Record<string, unknown>)
  if (keys.length > MAX_PROFILE_KEYS) return false
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_PROFILE_BYTES) return false
  return true
}

export async function GET() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const { data, error } = await supabase
    .from('brand_profiles')
    .select('profile')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('brand-profile GET error:', error.message)
    return NextResponse.json({ profile: null, error: 'Failed to load profile' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ profile: data?.profile ?? null }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  if (!sameOriginOk(req)) {
    return NextResponse.json({ profile: null, error: 'Cross-origin request rejected' }, { status: 403, headers: NO_STORE })
  }

  // Hardened read: hard byte ceiling enforced while the stream is consumed, so
  // a giant payload can't burn memory/CPU in JSON.parse ahead of the key/size
  // checks — and the limit holds even with a missing/false Content-Length.
  const parsed = await readJsonLimited<unknown>(req, { maxBytes: MAX_PROFILE_BYTES })
  if (!parsed.ok) {
    const error = parsed.status === 413 ? 'Profile payload too large' : parsed.error
    return NextResponse.json({ profile: null, error }, { status: parsed.status, headers: NO_STORE })
  }

  if (!validProfile(parsed.value)) {
    return NextResponse.json({ profile: null, error: 'Invalid profile payload' }, { status: 400, headers: NO_STORE })
  }
  const profile = parsed.value

  const { data, error } = await supabase
    .from('brand_profiles')
    .upsert(
      { user_id: user.id, profile, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('profile')
    .maybeSingle()

  if (error) {
    console.error('brand-profile POST error:', error.message)
    return NextResponse.json({ profile: null, error: 'Failed to save profile' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ profile: data?.profile ?? profile }, { headers: NO_STORE })
}
