// Authenticated customer Lab boundary.
// Auth proves the user; explicit Lab membership proves the tenant. Request organizationId is only
// a lookup target and never authority by itself.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { bindLabExperimentToUniversityRun, createSupabaseLabExecutionDb, type VerifiedLabAuthority } from '@/lib/ai/cos/itmountsLabUniversityExecution'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req:NextRequest){
  const cookieStore=await cookies()
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookieOptions:saasSupabaseCookieOptions,
    cookies:{get:(name)=>cookieStore.get(name)?.value,set:()=>{},remove:()=>{}},
  })
  const {data:{user}}=await auth.auth.getUser()
  if(!user) return NextResponse.json({ok:false,error:'unauthorized'},{status:401})

  const body=await req.json().catch(()=>null)
  const organizationId=String(body?.organizationId??'').trim()
  const experimentId=String(body?.experimentId??'').trim()
  const runId=String(body?.runId??'').trim()
  const harnessRunId=String(body?.harnessRunId??'').trim()
  if(![organizationId,experimentId,runId,harnessRunId].every(v=>UUID.test(v)))
    return NextResponse.json({ok:false,error:'invalid_identifier'},{status:400})

  const service=cosServiceDb()
  if(!service) return NextResponse.json({ok:false,error:'lab_service_unavailable'},{status:503})

  // Critical BOLA guard: user identity comes from auth.getUser(); tenant membership comes from
  // the private Lab membership table via service-role RPC, never from request claims/metadata.
  const {data:membership,error:membershipError}=await service.rpc('itmounts_lab_resolve_user_organization',{
    p_user_id:user.id,p_organization_id:organizationId,
  })
  if(membershipError) return NextResponse.json({ok:false,error:'lab_membership_unavailable'},{status:503})
  const member=membership as null|{organization_id?:string;status?:string}
  if(!member||member.organization_id!==organizationId||member.status!=='active')
    return NextResponse.json({ok:false,error:'lab_tenant_forbidden'},{status:403})

  // The HTTP route does not create authority. It converts already-authenticated membership into
  // the narrow execution capability consumed by the governed server seam.
  const authority:VerifiedLabAuthority={
    verifiedByHarness:true,
    organizationId,
    harnessRunId,
    capability:'university.distillation.execute',
    authorityExpanded:false,
  }

  try{
    const result=await bindLabExperimentToUniversityRun({
      authority,experimentId,runId,db:createSupabaseLabExecutionDb(service),
    })
    return NextResponse.json(result,{status:200})
  }catch(error){
    const message=error instanceof Error?error.message:'lab_execution_failed'
    if(/tenant_mismatch|authority_denied|authority_expansion/.test(message))
      return NextResponse.json({ok:false,error:message},{status:403})
    if(/missing/.test(message)) return NextResponse.json({ok:false,error:message},{status:404})
    return NextResponse.json({ok:false,error:message},{status:409})
  }
}
