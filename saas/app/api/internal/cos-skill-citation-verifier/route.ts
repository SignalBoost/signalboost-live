import { NextRequest, NextResponse } from 'next/server'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { authoritativeProvenance } from '@/lib/ai/cos/cosOrchestration'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

const TOKEN='R8mV4qK2xP7nC9sF3jH6wT1bD5zL0uY4eG8aN2rS6pQ9'
const EXPIRES_AT=Date.parse('2026-08-13T06:45:00Z')
const BENCHMARK='A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged. Diagnose the most likely architectural causes, rank them, and explain how you would distinguish between them without making production changes.'

export async function GET(req:NextRequest){
  if(Date.now()>=EXPIRES_AT||req.nextUrl.searchParams.get('token')!==TOKEN)return NextResponse.json({error:'gone'},{status:410})
  try{
    const result=await tryCOSFirstAnswer({prompt:BENCHMARK,userId:null,language:'English',privileged:true})
    return NextResponse.json({ok:true,result,authoritative:authoritativeProvenance(result,{invoked:false})})
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500})
  }
}
