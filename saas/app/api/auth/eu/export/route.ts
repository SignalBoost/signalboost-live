import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!euCustomerLaunchReadiness().ready) {
    return NextResponse.json({ error: 'eu_export_unavailable' }, { status: 503 })
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') || '')
  if (!match) return NextResponse.json({ error: 'eu_auth_required' }, { status: 401 })
  const token = match[1]
  const eu = createClient(process.env.EU_SUPABASE_URL!, process.env.EU_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  const { data: auth, error: authError } = await eu.auth.getUser(token)
  if (authError || !auth.user || auth.user.is_anonymous) {
    return NextResponse.json({ error: 'eu_auth_invalid' }, { status: 401 })
  }
  const uid = auth.user.id
  const [profile, binding] = await Promise.all([
    eu.from('profiles').select('id,user_id,display_name,onboarded,onboarding_completed,consent_ai_training,tone_preference,created_at,updated_at').eq('id', uid).maybeSingle(),
    eu.from('eu_auth_profiles').select('user_id,tenant_id,created_at').eq('user_id', uid).maybeSingle(),
  ])
  if (profile.error || binding.error || !binding.data || binding.data.user_id !== uid) {
    return NextResponse.json({ error: 'eu_export_scope_unavailable' }, { status: 503 })
  }
  return NextResponse.json({
    region: 'eu-central-1',
    scope: 'eu_account_foundation_only',
    notice: 'This is not a complete export of application and connected-provider data.',
    account: { id: uid, email: auth.user.email ?? null, created_at: auth.user.created_at },
    profile: profile.data,
    tenantBinding: binding.data,
  }, { headers: {
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'attachment; filename="itmounts-eu-account.json"',
    'X-Content-Type-Options': 'nosniff',
  } })
}
