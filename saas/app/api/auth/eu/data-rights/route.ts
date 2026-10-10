import { NextRequest, NextResponse } from 'next/server'
import { authenticateEuBearer } from '@/lib/security/euAuthenticatedClient.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

async function ownTenant(request: NextRequest) {
  const auth = await authenticateEuBearer(request.headers.get('authorization'))
  if (auth.status !== 200) return { error: auth.error, status: auth.status as number }
  const { data, error } = await auth.client.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id',auth.user.id).maybeSingle()
  if (error || !data) return { error: 'eu_account_not_provisioned', status: 403 }
  return { auth, tenantId: data.tenant_id }
}

/** EU requests are queued for verified processing, never represented as executed deletion. */
export async function POST(request: NextRequest) {
  const context = await ownTenant(request)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => k !== 'type')) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const type = (body as { type?: unknown }).type
  if (type !== 'export' && type !== 'delete') return NextResponse.json({ error: 'invalid_request_type' }, { status: 400, headers })
  const { auth, tenantId } = context
  const { data, error } = await auth.client.from('eu_data_rights_requests')
    .insert({ user_id: auth.user.id, tenant_id: tenantId, request_type: type })
    .select('id,request_type,status,created_at').single()
  if (error || !data) return NextResponse.json({ error: 'eu_request_unavailable_or_duplicate' }, { status: 409, headers })
  return NextResponse.json({ request: data, region: 'eu-central-1', processingComplete: false }, { status: 202, headers })
}

export async function GET(request: NextRequest) {
  const context = await ownTenant(request)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status, headers })
  const { auth, tenantId } = context
  const { data, error } = await auth.client.from('eu_data_rights_requests')
    .select('id,request_type,status,created_at,updated_at,completed_at')
    .eq('user_id',auth.user.id).eq('tenant_id',tenantId).order('created_at',{ ascending: false }).limit(25)
  if (error) return NextResponse.json({ error: 'eu_request_lookup_unavailable' }, { status: 503, headers })
  return NextResponse.json({ requests: data, region: 'eu-central-1' }, { headers })
}
