import { NextRequest, NextResponse } from 'next/server'
import { resolveEuTenant } from '@/lib/security/resolveEuTenant.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  const { data, error } = await owner.client.from('eu_projects')
    .select('id,name,type,language,status,content,handle,created_at,last_edited_at')
    .eq('user_id',owner.userId).eq('tenant_id',owner.tenantId)
    .order('last_edited_at',{ ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'eu_projects_unavailable' }, { status: 503, headers })
  return NextResponse.json({ region: 'eu-central-1', projects: data }, { headers })
}

export async function POST(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['name','type','language','content'].includes(key))) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  }
  const input = body as Record<string,unknown>
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160 ||
      (input.type !== undefined && (typeof input.type !== 'string' || input.type.length > 50)) ||
      (input.language !== undefined && (typeof input.language !== 'string' || input.language.length > 12)) ||
      (input.content !== undefined && JSON.stringify(input.content).length > 262144)) {
    return NextResponse.json({ error: 'invalid_project' }, { status: 400, headers })
  }
  const { data, error } = await owner.client.from('eu_projects')
    .insert({ user_id: owner.userId, tenant_id: owner.tenantId, name: input.name.trim(),
      type: input.type || 'website', language: input.language || 'en',
      content: input.content || null })
    .select('id,name,type,language,status,created_at,last_edited_at').single()
  if (error || !data) return NextResponse.json({ error: 'eu_project_creation_failed' }, { status: 503, headers })
  return NextResponse.json({ project: data, region: 'eu-central-1' }, { status: 201, headers })
}
