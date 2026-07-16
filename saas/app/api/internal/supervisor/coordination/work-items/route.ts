import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
const limitOf = (v: string | null) => Math.min(Math.max(Number(v || 25), 1), 100)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth
  const url = new URL(req.url); const limit = limitOf(url.searchParams.get('limit'))
  let q = auth.admin.from('supervisor_work_items').select('work_item_id,work_item_type,incident_id,dispatch_id,execution_id,provider,tenant_id,organization_id,environment,state,priority,available_at,attempt,max_attempts,policy_version,capability_version,adapter_version,fencing_generation,created_at,updated_at,terminal_at,schema_version').order('updated_at',{ascending:false}).limit(limit)
  for (const [param, col] of [['state','state'],['provider','provider'],['environment','environment'],['incidentId','incident_id']] as const) if (url.searchParams.get(param)) q = q.eq(col, url.searchParams.get(param)!)
  const { data, error } = await q
  if (error) return NextResponse.json({ error:'Coordination store unavailable' }, { status:503 })
  return NextResponse.json({ schemaVersion:'supervisor-coordination-work-items-response-v1', items:data ?? [], nextCursor:(data?.length === limit ? data[data.length-1]?.updated_at : undefined) })
}
