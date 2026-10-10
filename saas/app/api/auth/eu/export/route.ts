import { NextRequest, NextResponse } from 'next/server'
import { authenticateEuBearer } from '@/lib/security/euAuthenticatedClient.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Strictly bounded reads prevent exporting a misleading partial dataset. */
const PAGE_SIZE = 500
const MAX_PAGES = 20

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
  const tenantId = binding.data.tenant_id

  async function ownRows(table: 'eu_projects' | 'eu_builder_workspaces' | 'eu_builder_workspace_files' | 'eu_data_rights_requests') {
    const items: Record<string, unknown>[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await auth.client.from(table).select('*')
        .eq('user_id', uid).eq('tenant_id', tenantId)
        .order(table === 'eu_builder_workspace_files' ? 'workspace_id' : 'id', { ascending: true })
        .order(table === 'eu_builder_workspace_files' ? 'path' : 'user_id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error || !data) throw new Error('eu_export_query_unavailable')
      items.push(...data)
      if (data.length < PAGE_SIZE) return items
    }
    throw new Error('eu_export_exceeds_safe_limit')
  }

  try {
    const [projects, workspaces, files, requests] = await Promise.all([
      ownRows('eu_projects'), ownRows('eu_builder_workspaces'),
      ownRows('eu_builder_workspace_files'), ownRows('eu_data_rights_requests'),
    ])
    return NextResponse.json({
      region: 'eu-central-1',
      scope: 'eu_regional_account_and_application_records',
      notice: 'Covers account and current Frankfurt project/workspace records. Connected-provider and external processor records require separate fulfillment.',
      account: { id: uid, email: auth.user.email ?? null, created_at: auth.user.created_at },
      profile: profile.data, tenantBinding: binding.data,
      projects, workspaces, workspaceFiles: files, dataRightsRequests: requests,
    }, { headers: { ...headers,
      'Content-Disposition': 'attachment; filename="itmounts-eu-data.json"',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return NextResponse.json({ error: 'eu_complete_regional_export_unavailable' }, { status: 503, headers })
  }
}
