import {NextResponse} from 'next/server'
import {requireOwner} from '@/lib/auth/access'
import {getAdminSupabase} from '@/utils/supabase/server'

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
 const tenant=process.env.ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID?.trim()??''
 const revision=process.env.VERCEL_GIT_COMMIT_SHA?.trim()??''
 const tenantConfigured=tenant.length>0&&tenant.length<=128
 const revisionConfigured=/^[a-f0-9]{7,64}$/i.test(revision)
 const {data:tenantValid,error:scopeError}=tenantConfigured
   ? await db.rpc('itmounts_lab_observability_scope_valid',{p_tenant_id:tenant})
   : {data:false,error:null}
 if(scopeError)return NextResponse.json({ok:false,error:'lab_scope_validation_unavailable'},{status:503,headers})
 return NextResponse.json({
  ok:true,organizations:Number(memberships??0),tenantConfigured,tenantValid:tenantValid===true,revisionConfigured,
  liveEvidenceVerified:false,supervisorDeliveryVerified:false,
  readyForMonitoring:tenantConfigured&&tenantValid===true&&revisionConfigured&&Number(memberships)>0,
  blockers:[
   ...(!Number(memberships)?['no_registered_lab_organizations']:[]),
   ...(!tenantConfigured?['tenant_not_configured']:[]),
   ...(tenantConfigured&&tenantValid!==true?['configured_tenant_has_no_active_lab_owner']:[]),
   ...(!revisionConfigured?['exact_revision_not_configured']:[]),
  ],
 },{headers})
}
