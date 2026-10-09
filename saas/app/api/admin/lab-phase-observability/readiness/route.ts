import {NextResponse} from 'next/server'
import {requireOwner} from '@/lib/auth/access'
import {getAdminSupabase} from '@/utils/supabase/server'
import {resolveLabMonitoringTenant} from '@/lib/ai/cos/labMonitoringTenant'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
/** Owner-only, aggregate readiness check. No synthetic organization creation or tenant ID leakage. */
export async function GET(){
 const guard=await requireOwner()
 if(!guard.ok)return NextResponse.json({ok:false,error:'not_authorized'},{status:guard.status,headers})
 const db=getAdminSupabase()
 const {data:memberships,error:membershipError}=await db.rpc('itmounts_lab_observability_owner_organization_count')
 if(membershipError) return NextResponse.json({ok:false,error:'lab_organization_readiness_unavailable'},{status:503,headers})
 const revision=process.env.VERCEL_GIT_COMMIT_SHA?.trim()??''
 const revisionConfigured=/^[a-f0-9]{7,64}$/i.test(revision)
 let tenant:string|null
 try { tenant=await resolveLabMonitoringTenant(db) }
 catch {return NextResponse.json({ok:false,error:'lab_scope_validation_unavailable'},{status:503,headers})}
 const tenantConfigured=Boolean(process.env.ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID?.trim())
 const tenantValid=Boolean(tenant)
 return NextResponse.json({
  ok:true,organizations:Number(memberships??0),tenantConfigured,tenantValid,revisionConfigured,
  liveEvidenceVerified:false,supervisorDeliveryVerified:false,
  readyForMonitoring:tenantValid&&revisionConfigured&&Number(memberships)>0,
  blockers:[
   ...(!Number(memberships)?['no_registered_lab_organizations']:[]),
   ...(!tenantValid?['no_unique_authorized_monitoring_tenant']:[]),
   ...(!revisionConfigured?['exact_revision_not_configured']:[]),
  ],
 },{headers})
}
