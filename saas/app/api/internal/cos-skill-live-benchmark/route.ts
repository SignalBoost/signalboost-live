import { NextRequest, NextResponse } from 'next/server'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { authoritativeProvenance } from '@/lib/ai/cos/cosOrchestration'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

const TOKEN='G7kP2mW9xQ4vN8rT1sF6hD3jL5bC0zA2uY9eR4iO7pS1'
const EXPIRES_AT=Date.parse('2026-08-13T06:30:00Z')
const BENCHMARK='A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged. Diagnose the most likely architectural causes, rank them, and explain how you would distinguish between them without making production changes.'

export async function GET(req:NextRequest){
  if(Date.now()>=EXPIRES_AT||req.nextUrl.searchParams.get('token')!==TOKEN)return NextResponse.json({error:'gone'},{status:410})
  try{
    const result=await tryCOSFirstAnswer({prompt:BENCHMARK,userId:null,language:'English',privileged:true})
    return NextResponse.json({ok:true,benchmark:BENCHMARK,result,authoritative:authoritativeProvenance(result,{invoked:false})})
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500})
  }
}
