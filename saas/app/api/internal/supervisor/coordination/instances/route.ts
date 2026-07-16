import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
const limitOf = (v: string | null) => Math.min(Math.max(Number(v || 25), 1), 100)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth
  const url = new URL(req.url); const limit = limitOf(url.searchParams.get('limit'))
  let q = auth.admin.from('supervisor_instances').select('instance_id,runtime_id,region,availability_zone,software_version,supported_provider_kinds,status,started_at,heartbeat_at,schema_version').order('heartbeat_at',{ascending:false}).limit(limit)
  if (url.searchParams.get('status')) q = q.eq('status', url.searchParams.get('status')!)
  if (url.searchParams.get('region')) q = q.eq('region', url.searchParams.get('region')!)
  if (url.searchParams.get('providerKind')) q = q.contains('supported_provider_kinds', [url.searchParams.get('providerKind')!])
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Coordination store unavailable' }, { status: 503 })
  return NextResponse.json({ schemaVersion:'supervisor-coordination-instances-response-v1', items:data ?? [], nextCursor:(data?.length === limit ? data[data.length-1]?.heartbeat_at : undefined) })
}
