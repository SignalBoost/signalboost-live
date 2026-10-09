import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { euRuntimeReadiness } from '@/lib/security/euRuntimeReadiness.ts'
import { proposedEnrollmentRegion } from '@/lib/security/euEnrollmentRouting.ts'
import { provisionEuAccount } from '@/lib/security/provisionEuAccount.ts'

export const runtime = 'nodejs'

/**
 * Only an EU Supabase Auth access token can complete EU account provisioning.
 * US Supabase sessions are never accepted. Remains fail-closed until EU Auth
 * and schema readiness are explicitly enabled after integration verification.
 */
export async function POST(request: NextRequest) {
  const readiness = euRuntimeReadiness()
  if (!readiness.ready) {
    return NextResponse.json({ error: 'eu_enrollment_unavailable' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization)
  if (!match) return NextResponse.json({ error: 'eu_auth_required' }, { status: 401 })

  let input: unknown
  try { input = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const record = input as Record<string, unknown>
  if (typeof record.countryCode !== 'string' || typeof record.displayName !== 'string' ||
      record.countryCode.length > 2 || record.displayName.length > 160) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  try {
    if (proposedEnrollmentRegion(record.countryCode) !== 'EU_EEA') {
      return NextResponse.json({ error: 'eu_country_required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Validate the bearer token against Frankfurt Auth itself, not the US project.
  const eu = createClient(process.env.EU_SUPABASE_URL!, process.env.EU_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await eu.auth.getUser(match[1])
  if (error || !data.user || data.user.is_anonymous) {
    return NextResponse.json({ error: 'eu_auth_invalid' }, { status: 401 })
  }

  try {
    await provisionEuAccount({
      euAuthUserId: data.user.id,
      countryCode: record.countryCode,
      displayName: record.displayName,
    })
    return NextResponse.json({ provisioned: true, region: 'eu-central-1' }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'eu_provisioning_unavailable' }, { status: 503 })
  }
}
