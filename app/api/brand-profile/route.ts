// app/api/brand-profile/route.ts
// Per-user brand profile, RLS-scoped — a user can only read/write their own.
// Hardened:
//   • POST verifies Origin/Referer against the request host (CSRF defense).
//   • Malformed JSON is rejected with 400 instead of silently overwriting {}.
//   • Payload must be a plain object within strict size / key limits.

import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

const MAX_PROFILE_BYTES = 100_000
const MAX_PROFILE_KEYS = 200

function sameOriginOk(req: Request): boolean {
  const host = req.headers.get('host')
  if (!host) return false
  const candidate = req.headers.get('origin') || req.headers.get('referer')
  if (!candidate) return false // state-changing browser fetches always send Origin
  try {
    return new URL(candidate).host === host
  } catch {
    return false
  }
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
