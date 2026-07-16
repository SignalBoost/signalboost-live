import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
export async function GET(_req: NextRequest, ctx: { params: Promise<{ workItemId: string }> | { workItemId: string } }) {
  const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth
  const { workItemId } = await ctx.params
  const [{ data: workItem, error }, { data: currentLease }, { data: events }] = await Promise.all([
    auth.admin.from('supervisor_work_items').select('work_item_id,work_item_type,incident_id,dispatch_id,execution_id,provider,tenant_id,organization_id,environment,state,priority,available_at,attempt,max_attempts,policy_version,capability_version,adapter_version,fencing_generation,created_at,updated_at,terminal_at,schema_version').eq('work_item_id', workItemId).maybeSingle(),
    auth.admin.from('supervisor_leases').select('lease_id,work_item_id,owner_instance_id,owner_runtime_id,fencing_token,acquired_at,heartbeat_at,expires_at,released_at,status,policy_version,schema_version').eq('work_item_id', workItemId).order('created_at',{ascending:false}).limit(10),
    auth.admin.from('supervisor_coordination_events').select('event_id,work_item_id,lease_id,instance_id,runtime_id,event_type,fencing_token,occurred_at,payload,schema_version').eq('work_item_id', workItemId).order('occurred_at',{ascending:false}).limit(100),
  ])
  if (error) return NextResponse.json({ error:'Coordination store unavailable' }, { status:503 })
  if (!workItem) return NextResponse.json({ error:'Not found' }, { status:404 })
  return NextResponse.json({ schemaVersion:'supervisor-coordination-work-item-detail-response-v1', workItem, currentLease:currentLease?.[0] ?? null, ownershipHistory:currentLease ?? [], coordinationEvents:events ?? [] })
}
