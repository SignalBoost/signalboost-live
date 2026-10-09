import { NextRequest,NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'
import { readTenantLabObservations } from '@/lib/ai/cos/labPhaseObservabilityRead'
import { resolveLabMonitoringTenant } from '@/lib/ai/cos/labMonitoringTenant'
import { dispatchLabHealthAlerts } from '@/lib/ai/cos/labPhaseSupervisorBridge'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'no-store'}
const authorized=(header:string|null,secret:string|undefined)=>{
  if(!header?.startsWith('Bearer ')||!secret||secret.length<32)return false
  const a=Buffer.from(header.slice(7)),b=Buffer.from(secret)
  return a.length===b.length&&timingSafeEqual(a,b)
}
/** Host-invoked, read-only check. Alerts are returned to the authenticated caller;
 * no self-healing or arbitrary external calls are authorized. */
export async function GET(req:NextRequest){
  if(!authorized(req.headers.get('authorization'),process.env.CRON_SECRET))
    return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers})
  const revision=process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if(!revision||!/^[a-f0-9]{7,64}$/i.test(revision))
    return NextResponse.json({ok:false,error:'observability_scope_not_configured'},{status:503,headers})
  try{
    const db=getAdminSupabase()
    const tenant=await resolveLabMonitoringTenant(db)
    if(!tenant)return NextResponse.json({ok:false,error:'observability_scope_not_authorized'},{status:503,headers})
    const events=await readTenantLabObservations(db,tenant,revision)
    const alerts: {code:string;phase:number;signal:string;exactRevision:string;severity:string}[]=[]
    const result=await dispatchLabHealthAlerts(events,revision,Date.now(),alert=>{alerts.push(alert)})
    // Aggregate only: no tenant IDs or raw evidence in deployment logs.
    const counts = {unknown: alerts.filter(a=>a.code==='lab_phase_signal_unknown').length,
      stale:alerts.filter(a=>a.code==='lab_phase_signal_stale').length,
      blocked:alerts.filter(a=>a.code==='lab_phase_signal_blocked').length}
    if (alerts.length) console.warn('[lab_phase_observability_health_alerts]', counts)
    // Store advisory alerts within this tenant's private service-role boundary.
    // Persist before acknowledging the check. Never claim an external Supervisor received them.
    if (alerts.length) {
      const rows=alerts.map(a=>({
        tenant_id:tenant,exact_revision:revision,phase:a.phase,signal:a.signal,
        code:a.code,severity:a.severity,last_seen_at:new Date().toISOString(),
      }))
      const {error:outboxError}=await getAdminSupabase().from('lab_phase_health_alerts')
        .upsert(rows,{onConflict:'tenant_id,exact_revision,phase,signal'})
      if(outboxError) throw Error('lab_phase_alert_outbox_unavailable')
    }
    return NextResponse.json({ok:true,revision,alerts,health:result.health,
      persistedAlerts:alerts.length,deliveredToExternalSupervisor:false},{headers})
  }catch{
    return NextResponse.json({ok:false,error:'observability_health_check_unavailable'},{status:503,headers})
  }
}
