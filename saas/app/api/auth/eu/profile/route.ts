import { NextRequest, NextResponse } from 'next/server'
import { authenticateEuBearer } from '@/lib/security/euAuthenticatedClient.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

/** Frankfurt-only account profile. Never creates a US session or crosses residency boundaries. */
export async function GET(request: NextRequest) {
  const auth = await authenticateEuBearer(request.headers.get('authorization'))
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  const [profile, binding] = await Promise.all([
    auth.client.from('profiles').select('id,display_name,tone_preference,consent_ai_training,created_at,updated_at').eq('id',auth.user.id).maybeSingle(),
    auth.client.from('eu_auth_profiles').select('tenant_id').eq('user_id',auth.user.id).maybeSingle(),
  ])
  if (profile.error || binding.error || !profile.data || !binding.data) {
    return NextResponse.json({ error: 'eu_account_not_provisioned' }, { status: 403, headers })
  }
  return NextResponse.json({ region: 'eu-central-1', profile: profile.data, tenantProvisioned: true }, { headers })
}

/** All edits go through the Frankfurt user client and ownership-scoped RLS. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateEuBearer(request.headers.get('authorization'))
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  let input: unknown
  try { input = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers })
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(k => !['displayName','consentAiTraining'].includes(k))) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400, headers })
  }
  const update: { display_name?: string; consent_ai_training?: boolean; updated_at?: string } = {}
  if ('displayName' in body) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 160) return NextResponse.json({ error: 'invalid_display_name' }, { status: 400, headers })
    update.display_name = body.displayName.trim()
  }
  if ('consentAiTraining' in body) {
    if (typeof body.consentAiTraining !== 'boolean') return NextResponse.json({ error: 'invalid_consent' }, { status: 400, headers })
    update.consent_ai_training = body.consentAiTraining
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'empty_update' }, { status: 400, headers })
  const { data: tenant, error: tenantError } = await auth.client.from('eu_auth_profiles').select('tenant_id').eq('user_id', auth.user.id).maybeSingle()
  if (tenantError || !tenant) return NextResponse.json({ error: 'eu_account_not_provisioned' }, { status: 403, headers })
  update.updated_at = new Date().toISOString()
  const { data, error } = await auth.client.from('profiles').update(update).eq('id', auth.user.id).select('id,display_name,consent_ai_training,updated_at').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'eu_profile_update_unavailable' }, { status: 503, headers })
  return NextResponse.json({ region: 'eu-central-1', profile: data }, { headers })
}
