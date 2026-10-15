import { NextRequest, NextResponse } from 'next/server'
import { customerSession,UUID_RE,rpcErrorCode } from '@/lib/lab/customerSession'
import { observeLabRequest } from '@/lib/lab/observability'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'cache-control':'no-store'}
async function handler(req:NextRequest){
 const session=await customerSession()
 if(!session)return NextResponse.json({ok:false,error:'lab_unauthorized'},{status:401,headers})
 const organizationId=req.nextUrl.searchParams.get('organizationId')??''
 if(!UUID_RE.test(organizationId))return NextResponse.json({ok:false,error:'lab_diagnostics_selection_invalid'},{status:400,headers})
 const {data,error}=await session.supabase.rpc('itmounts_lab_customer_run_diagnostics',{p_organization_id:organizationId})
 if(error)return NextResponse.json({ok:false,error:rpcErrorCode(error)},{status:403,headers})
 return NextResponse.json({ok:true,diagnostics:data},{headers})
}
export function GET(req:NextRequest){return observeLabRequest('training.diagnostics',()=>handler(req))}
