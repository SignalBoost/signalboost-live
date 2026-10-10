import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** EU-only caller session probe. Never accepts a US token or looks up a US tenant. */
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!euCustomerLaunchReadiness().ready) {
    return NextResponse.json({ error: 'eu_session_unavailable' }, { status: 503, headers })
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')
  if (!match) return NextResponse.json({ error: 'eu_auth_required' }, { status: 401, headers })
  const eu = createClient(process.env.EU_SUPABASE_URL!, process.env.EU_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + match[1] } },
  })
  const { data: auth, error: authError } = await eu.auth.getUser(match[1])
  if (authError || !auth.user || auth.user.is_anonymous) {
    return NextResponse.json({ error: 'eu_auth_invalid' }, { status: 401, headers })
  }
  const { data: tenant, error } = await eu.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id', auth.user.id).maybeSingle()
  if (error || !tenant) {
    return NextResponse.json({ error: 'eu_tenant_not_provisioned' }, { status: 403, headers })
  }
  return NextResponse.json({
    authenticated: true, region: 'eu-central-1', tenantProvisioned: true,
    userId: auth.user.id,
  }, { headers })
}
