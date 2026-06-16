import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'

// Reads live env + pings the marketing project; never cache.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const present = (v: string | undefined | null): boolean => !!(v && v.trim())

// ─── Key inspection (never returns the key itself) ────────────────────────────
// Supabase service keys come in two shapes:
//   • legacy JWT — a base64url payload carrying a `role` claim
//     ('service_role' = full access / bypasses RLS, 'anon' = the WRONG key, which
//      is exactly the original mis-config: an anon key where service_role belongs)
//   • new format — 'sb_secret_…' (secret) / 'sb_publishable_…' (public, wrong here)
function inspectKey(key: string | undefined): {
  format: 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown'
  role: string | null
  looks_wrong: boolean
  reason: string | null
} {
  if (!key) return { format: 'unknown', role: null, looks_wrong: false, reason: null }

  if (key.startsWith('sb_secret_')) {
    return { format: 'sb_secret', role: 'service', looks_wrong: false, reason: null }
  }
  if (key.startsWith('sb_publishable_')) {
    return {
      format: 'sb_publishable',
      role: 'publishable',
      looks_wrong: true,
      reason: 'Key is a PUBLISHABLE key — a secret/service_role key is required',
    }
  }

  // Try to decode a JWT payload's role claim (without trusting/echoing the token)
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      const role = typeof payload?.role === 'string' ? payload.role : null
      if (role === 'anon') {
        return {
          format: 'jwt',
          role,
          looks_wrong: true,
          reason: 'Key is an ANON key — a service_role key is required (this was the original mis-config)',
        }
      }
      return { format: 'jwt', role, looks_wrong: false, reason: null }
    } catch {
      return { format: 'jwt', role: null, looks_wrong: false, reason: null }
    }
  }

  return { format: 'unknown', role: null, looks_wrong: false, reason: null }
}

// ─── route ──────────────────────────────────────────────────────────────────

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  const failures: string[] = []

  const url = process.env.MARKETING_SUPABASE_URL
  const key = process.env.MARKETING_SUPABASE_SERVICE_ROLE_KEY
  const urlPresent = present(url)
  const keyPresent = present(key)

  if (!urlPresent) failures.push('MARKETING_SUPABASE_URL is missing')
  if (!keyPresent) failures.push('MARKETING_SUPABASE_SERVICE_ROLE_KEY is missing')

  const keyInfo = inspectKey(key)
  if (keyPresent && keyInfo.looks_wrong && keyInfo.reason) {
    failures.push(keyInfo.reason)
  }

  // ── Live reachability: same call the executor's list_tables uses ────────────
  let reachable = false
  let tableCount: number | null = null
  let restError: string | null = null
  if (urlPresent && keyPresent) {
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          apikey: key!,
          Authorization: 'Bearer ' + key!,
          Accept: 'application/openapi+json',
        },
      })
      if (res.ok) {
        reachable = true
        try {
          const spec = await res.json()
          const defs = spec?.definitions ? Object.keys(spec.definitions) : []
          tableCount = defs.filter((n: string) => n && !n.startsWith('(')).length
        } catch {
          tableCount = null
        }
      } else {
        restError = (await res.text()) || `PostgREST returned ${res.status}`
        failures.push(`Marketing Supabase did not authenticate: ${restError.slice(0, 200)}`)
      }
    } catch (err: any) {
      restError = err?.message || 'Request failed'
      failures.push(`Marketing Supabase ping failed: ${restError}`)
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checked_at: new Date().toISOString(),
    marketing_supabase: {
      url_present: urlPresent,
      key_present: keyPresent,
      key_format: keyInfo.format,
      key_role: keyInfo.role,
      reachable,
      table_count: tableCount,
      error: restError,
    },
    failures,
  })
}
