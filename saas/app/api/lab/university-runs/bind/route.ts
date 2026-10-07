import { NextRequest,NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { bindLabExperimentToUniversityRun,createSupabaseLabExecutionDb,type VerifiedLabAuthority } from '@/lib/ai/cos/itmountsLabUniversityExecution'
import { withCustomerLabUniversityBindingHarness } from '@/platform-harness/adapters/lab-customer'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req:NextRequest){
 const cookieStore=await cookies()
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  cookieOptions:saasSupabaseCookieOptions,cookies:{get:n=>cookieStore.get(n)?.value,set:()=>{},remove:()=>{}},
 })
 const {data:{user}}=await auth.auth.getUser()
 if(!user)return NextResponse.json({ok:false,error:'unauthorized'},{status:401})
 const body=await req.json().catch(()=>null)
 const organizationId=String(body?.organizationId??'').trim(),experimentId=String(body?.experimentId??'').trim(),runId=String(body?.runId??'').trim()
 if(![organizationId,experimentId,runId].every(v=>UUID.test(v)))return NextResponse.json({ok:false,error:'invalid_identifier'},{status:400})
 const service=cosServiceDb()
 if(!service)return NextResponse.json({ok:false,error:'lab_service_unavailable'},{status:503})
 const {data:membership,error}=await service.rpc('itmounts_lab_resolve_user_organization',{p_user_id:user.id,p_organization_id:organizationId})
 const member=membership as null|{organization_id?:string;status?:string}
 if(error)return NextResponse.json({ok:false,error:'lab_membership_unavailable'},{status:503})
 if(!member||member.organization_id!==organizationId||member.status!=='active')return NextResponse.json({ok:false,error:'lab_tenant_forbidden'},{status:403})
 try{
  const result=await withCustomerLabUniversityBindingHarness({organizationId,operation:async manifest=>{
   const authority:VerifiedLabAuthority={
    verifiedByHarness:true,organizationId,harnessRunId:manifest.runId,
    capability:'university.distillation.execute',authorityExpanded:false,
   }
   return bindLabExperimentToUniversityRun({authority,experimentId,runId,db:createSupabaseLabExecutionDb(service)})
  }})
  return NextResponse.json(result)
 }catch(e){
  const message=e instanceof Error?e.message:'lab_execution_failed'
  const status=/tenant|authority|harness_denied/.test(message)?403:/missing/.test(message)?404:409
  return NextResponse.json({ok:false,error:message},{status})
 }
}
