import { NextRequest, NextResponse } from 'next/server'
import { authenticateEuBearer } from '@/lib/security/euAuthenticatedClient.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const auth = await authenticateEuBearer(request.headers.get('authorization'))
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  const uid = auth.user.id
  const [profile, binding] = await Promise.all([
    auth.client.from('profiles').select('id,user_id,slug,display_name,onboarded,onboarding_completed,consent_ai_training,tone_preference,created_at,updated_at').eq('id', uid).maybeSingle(),
    auth.client.from('eu_auth_profiles').select('user_id,tenant_id,created_at').eq('user_id', uid).maybeSingle(),
  ])
  if (profile.error || binding.error || !binding.data || binding.data.user_id !== uid) {
    return NextResponse.json({ error: 'eu_export_scope_unavailable' }, { status: 503, headers })
  }
  return NextResponse.json({
    region: 'eu-central-1', scope: 'eu_account_foundation_only',
    notice: 'Does not include application workspaces or connected-provider data.',
    account: { id: uid, email: auth.user.email ?? null, created_at: auth.user.created_at },
    profile: profile.data, tenantBinding: binding.data,
  }, { headers: { ...headers,
    'Content-Disposition': 'attachment; filename="itmounts-eu-account.json"',
    'X-Content-Type-Options': 'nosniff',
  } })
}
