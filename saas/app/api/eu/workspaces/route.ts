import { NextRequest, NextResponse } from 'next/server'
import { resolveEuTenant } from '@/lib/security/resolveEuTenant.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** European Builder workspaces persist only in Frankfurt tenant-scoped tables. */
export async function GET(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  const { data, error } = await owner.client.from('eu_builder_workspaces')
    .select('id,objective,created_at,updated_at').eq('user_id',owner.userId)
    .eq('tenant_id',owner.tenantId).order('updated_at',{ ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'eu_workspaces_unavailable' }, { status: 503, headers })
  return NextResponse.json({ region: 'eu-central-1', workspaces: data }, { headers })
}

export async function POST(request: NextRequest) {
  const owner = await resolveEuTenant(request.headers.get('authorization'))
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status, headers })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => key !== 'objective')) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const objective = (body as { objective?: unknown }).objective
  if (objective !== undefined && (typeof objective !== 'string' || objective.length > 500)) {
    return NextResponse.json({ error: 'invalid_objective' }, { status: 400, headers })
  }
  const { data, error } = await owner.client.from('eu_builder_workspaces')
    .insert({ user_id: owner.userId, tenant_id: owner.tenantId, objective: objective || null })
    .select('id,objective,created_at,updated_at').single()
  if (error || !data) return NextResponse.json({ error: 'eu_workspace_creation_failed' }, { status: 503, headers })
  return NextResponse.json({ workspace: data, region: 'eu-central-1' }, { status: 201, headers })
}
