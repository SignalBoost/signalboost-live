import { NextRequest, NextResponse } from 'next/server'
import { customerSession, UUID_RE, rpcErrorCode } from '@/lib/lab/customerSession'
import { observeLabRequest } from '@/lib/lab/observability'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'cache-control':'no-store'}
async function handler(req: NextRequest) {
 const session=await customerSession()
 if(!session)return NextResponse.json({ok:false,error:'lab_unauthorized'},{status:401,headers})
 const organizationId=req.nextUrl.searchParams.get('organizationId')||''
 const runId=req.nextUrl.searchParams.get('runId')||''
 if(!UUID_RE.test(organizationId)||!UUID_RE.test(runId))return NextResponse.json({ok:false,error:'lab_trace_selection_invalid'},{status:400,headers})
 const {data,error}=await session.supabase.rpc('itmounts_lab_customer_safe_training_events',{p_organization_id:organizationId,p_run_id:runId})
 if(error)return NextResponse.json({ok:false,error:rpcErrorCode(error)},{status:403,headers})
 return NextResponse.json({ok:true,events:data??[]},{headers})
}
export function GET(req: NextRequest){return observeLabRequest('training.trace',()=>handler(req))}
