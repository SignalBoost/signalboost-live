// app/api/brand-profile/route.ts
// Per-user brand profile, RLS-scoped — a user can only read/write their own.
// Hardened:
//   • POST verifies Origin/Referer against a configured canonical-origin
//     allowlist (env APP_ALLOWED_ORIGINS), NOT the raw Host header.
//   • Request body is rejected by Content-Length BEFORE parsing.
//   • Malformed JSON is rejected with 400 instead of silently overwriting {}.
//   • Payload must be a plain object within strict size / key limits.

import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

const MAX_PROFILE_BYTES = 100_000
const MAX_PROFILE_KEYS = 200

// Canonical origins this API trusts for state-changing requests. Configure via
// APP_ALLOWED_ORIGINS (comma-separated) in Vercel; falls back to the known
// production marketing domains. The raw Host header is never trusted on its own.
const CANONICAL_ORIGIN_HOSTS = (
  process.env.APP_ALLOWED_ORIGINS ||
  'https://signalboostapp.com,https://www.signalboostapp.com'
)
  .split(',')
  .map((entry) => {
    try {
      return new URL(entry.trim()).host.toLowerCase()
    } catch {
      return ''
    }
  })
  .filter(Boolean)

function sameOriginOk(req: Request): boolean {
  const candidate = req.headers.get('origin') || req.headers.get('referer')
  if (!candidate) return false // state-changing browser fetches always send Origin

  let candidateHost: string
  try {
    candidateHost = new URL(candidate).host.toLowerCase()
  } catch {
    return false
  }

  // 1) Primary check: candidate must match a configured canonical origin.
  if (CANONICAL_ORIGIN_HOSTS.includes(candidateHost)) return true

  // 2) Narrow fallback for Vercel preview deployments only, where Origin and
  //    Host legitimately match a platform-controlled *.vercel.app host. This is
  //    not "trust the Host header" — it is gated to a single trusted suffix.
  const reqHost = (req.headers.get('host') || '').toLowerCase()
  if (reqHost && candidateHost === reqHost && reqHost.endsWith('.vercel.app')) return true

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
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('brand_profiles')
    .select('profile')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('brand-profile GET error:', error.message)
    return NextResponse.json({ profile: null, error: 'Failed to load profile' }, { status: 500 })
  }
  return NextResponse.json({ profile: data?.profile ?? null })
}

export async function POST(req: Request) {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ profile: null, error: 'Unauthorized' }, { status: 401 })
  }

  if (!sameOriginOk(req)) {
    return NextResponse.json({ profile: null, error: 'Cross-origin request rejected' }, { status: 403 })
  }

  // Reject oversized bodies by Content-Length BEFORE parsing, so a giant payload
  // can't burn memory/CPU in req.json() ahead of the post-parse size check.
  const declaredLen = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLen) && declaredLen > MAX_PROFILE_BYTES) {
    return NextResponse.json({ profile: null, error: 'Profile payload too large' }, { status: 413 })
  }

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return NextResponse.json({ profile: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!validProfile(parsed)) {
    return NextResponse.json({ profile: null, error: 'Invalid profile payload' }, { status: 400 })
  }
  const profile = parsed

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
    return NextResponse.json({ profile: null, error: 'Failed to save profile' }, { status: 500 })
  }
  return NextResponse.json({ profile: data?.profile ?? profile })
}
