import { NextRequest, NextResponse } from 'next/server'
import { resolveEuTenant } from '@/lib/security/resolveEuTenant.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const safePath = (path: unknown): path is string =>
  typeof path === 'string' && path.length >= 1 && path.length <= 240 &&
  !/(^|\/)\.{1,2}(\/|$)/.test(path)

export async function GET(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') || ''
  if (!uuid.test(workspaceId)) return NextResponse.json({ error: 'invalid_workspace_id' }, { status: 400, headers })
  const { data, error } = await owner.client.from('eu_builder_workspace_files')
    .select('path,content,updated_at').eq('workspace_id',workspaceId)
    .eq('user_id',owner.userId).eq('tenant_id',owner.tenantId).order('path').limit(1000)
  if (error) return NextResponse.json({ error: 'eu_files_unavailable' }, { status: 503, headers })
  return NextResponse.json({ region: 'eu-central-1', workspaceId, files: data }, { headers })
}

export async function PUT(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['workspaceId','path','content'].includes(key))) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  }
  const { workspaceId, path, content } = body as Record<string,unknown>
  if (typeof workspaceId !== 'string' || !uuid.test(workspaceId) || !safePath(path) ||
      typeof content !== 'string' || Buffer.byteLength(content,'utf8') > 524288) {
    return NextResponse.json({ error: 'invalid_workspace_file' }, { status: 400, headers })
  }
  const { data, error } = await owner.client.from('eu_builder_workspace_files')
    .upsert({ workspace_id: workspaceId, user_id: owner.userId, tenant_id: owner.tenantId,
      path, content, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,path' })
    .select('path,updated_at').single()
  if (error || !data) return NextResponse.json({ error: 'eu_workspace_write_unavailable' }, { status: 503, headers })
  return NextResponse.json({ file: data, region: 'eu-central-1' }, { headers })
}

export async function DELETE(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') || ''
  const path = request.nextUrl.searchParams.get('path')
  if (!uuid.test(workspaceId) || !safePath(path)) return NextResponse.json({ error: 'invalid_workspace_file' }, { status: 400, headers })
  const { error } = await owner.client.from('eu_builder_workspace_files').delete()
    .eq('workspace_id',workspaceId).eq('path',path).eq('user_id',owner.userId).eq('tenant_id',owner.tenantId)
  if (error) return NextResponse.json({ error: 'eu_workspace_delete_unavailable' }, { status: 503, headers })
  return NextResponse.json({ removed: true, region: 'eu-central-1' }, { headers })
}
