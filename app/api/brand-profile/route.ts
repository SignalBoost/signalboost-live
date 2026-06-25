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
import { sameOriginOk } from '@/lib/http/sameOrigin'

const MAX_PROFILE_BYTES = 100_000
const MAX_PROFILE_KEYS = 200
const MAX_PROFILE_DEPTH = 32
const MAX_PROFILE_NODES = 5000

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const


// Iterative (non-recursive) structural bound check. Rejects payloads that exceed
// a maximum nesting depth or total node count BEFORE any JSON.stringify, so a
// within-byte-limit but pathologically-nested object (e.g. [[[[…]]]]) cannot
// trigger a stack-overflow RangeError or burn disproportionate CPU during
// serialization. Uses an explicit stack — no recursion of its own.
function withinStructuralBounds(root: unknown): boolean {
  const stack: { node: unknown; depth: number }[] = [{ node: root, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number }
    if (depth > MAX_PROFILE_DEPTH) return false
    if (node === null || typeof node !== 'object') continue
    nodes += 1
    if (nodes > MAX_PROFILE_NODES) return false
    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, depth: depth + 1 })
    } else {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        // Reject prototype-pollution-sensitive property names anywhere in the
        // tree. Harmless to store here, but defends any future code path that
        // deep-merges / Object.assigns a saved profile into another object.
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
        stack.push({ node: (node as Record<string, unknown>)[key], depth: depth + 1 })
      }
    }
  }
  return true
}

function validProfile(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as Record<string, unknown>)
  if (keys.length > MAX_PROFILE_KEYS) return false
  // Bound the structure before serializing it.
  if (!withinStructuralBounds(value)) return false
  // Size check, guarded: treat any serialization failure as an invalid payload
  // (controlled 400) instead of letting a RangeError bubble up to a 500.
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_PROFILE_BYTES) return false
  } catch {
    return false
  }
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
