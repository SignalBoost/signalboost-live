import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { assessLabPhaseHealth, makeLabPhaseObservation, type LabPhaseObservation } from '@/lib/ai/cos/labAllPhasesObservability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: 'not_authorized' }, {status:guard.status,headers})
  // Deliberately fixed by trusted deployment config: never accept tenant IDs from query parameters.
  const tenant = process.env.ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID?.trim()
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (!tenant || tenant.length > 128 || !revision || !/^[a-f0-9]{7,64}$/i.test(revision))
    return NextResponse.json({ok:false,error:'observability_tenant_or_revision_not_configured'}, {status:503,headers})
  const {data,error} = await getAdminSupabase().from('lab_phase_observations')
    .select('phase,signal,source,outcome,exact_revision,observed_at')
    .eq('tenant_id',tenant).eq('exact_revision',revision)
    .order('observed_at',{ascending:false}).limit(1000)
  if(error) return NextResponse.json({ok:false,error:'observability_storage_unavailable'}, {status:503,headers})
  const events:LabPhaseObservation[] = []
  // Database rows are untrusted: revalidate against the common allowlist.
  for(const row of data ?? []) {
    try {
      events.push(makeLabPhaseObservation({
        phase:row.phase,signal:row.signal,source:row.source,outcome:row.outcome,
        exactRevision:row.exact_revision,observedAt:new Date(row.observed_at).toISOString(),
      }))
    } catch { /* skip malformed row; never mint evidence from database contents */ }
  }
  const health = assessLabPhaseHealth(events,revision,Date.now())
  // Owner-only response; aggregate per-signal status, never tenant/evidence IDs.
  return NextResponse.json({ok:true,...health,observationCount:events.length}, {headers})
}
