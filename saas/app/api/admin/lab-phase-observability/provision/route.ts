import {NextRequest,NextResponse} from 'next/server'
import {requireOwner} from '@/lib/auth/access'
import {getAdminSupabase} from '@/utils/supabase/server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
/** Owner-invoked activation, never a cron or unverified agent action. */
export async function POST(req:NextRequest){
 const guard=await requireOwner()
 if(!guard.ok)return NextResponse.json({ok:false,error:'not_authorized'},{status:guard.status,headers})
 const ownerId=guard.ctx.userId
 if(!ownerId)return NextResponse.json({ok:false,error:'verified_owner_required'},{status:403,headers})
 const body=await req.json().catch(()=>null)
 const name=typeof body?.organizationName==='string'?body.organizationName.trim():''
 if(body?.confirmActivation!==true||!name||name.length>120)
   return NextResponse.json({ok:false,error:'explicit_name_and_confirmation_required'},{status:400,headers})
 const {data,error}=await getAdminSupabase().rpc('itmounts_lab_provision_owner_organization',{
   p_owner_user_id:ownerId,p_organization_name:name,
 })
 if(error||typeof data!=='string')
   return NextResponse.json({ok:false,error:'lab_provisioning_unavailable'},{status:503,headers})
 return NextResponse.json({ok:true,organizationId:data,creditBalanceInitializedAtZero:true,
   monitoringTenantConfigurationRequired:true,liveObservationsVerified:false},{headers})
}
