import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {'Cache-Control':'private, no-store'}
function authenticated(req:NextRequest):boolean {
  const secret=process.env.CRON_SECRET
  const header=req.headers.get('authorization')
  if(!header?.startsWith('Bearer ')||!secret||secret.length<32)return false
  const supplied=Buffer.from(header.slice(7))
  const expected=Buffer.from(secret)
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected)
}

/** Read-only, trusted host-scoped Supervisor feed. Does not invoke recovery or certify phases. */
export async function GET(req:NextRequest){
  if(!authenticated(req))return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers})
  const tenant=process.env.ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID?.trim()
  const revision=process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if(!tenant||tenant.length>128||!revision||!/^[a-f0-9]{7,64}$/i.test(revision))
    return NextResponse.json({ok:false,error:'observability_scope_not_configured'},{status:503,headers})
  try {
    const {data,error}=await getAdminSupabase().from('lab_phase_health_alerts')
      .select('phase,signal,code,severity,last_seen_at')
      .eq('tenant_id',tenant).eq('exact_revision',revision)
      .order('last_seen_at',{ascending:false}).limit(15)
    if(error)throw Error('outbox_read_failed')
    // Advisory evidence only. A consumer must independently validate tenant authority,
    // incident provenance and approved scope before any Supervisor action.
    return NextResponse.json({ok:true,revision,alerts:data??[],
      supervisorActionAuthorized:false,deliveredToSupervisor:false},{headers})
  }catch{return NextResponse.json({ok:false,error:'alert_feed_unavailable'},{status:503,headers})}
}
