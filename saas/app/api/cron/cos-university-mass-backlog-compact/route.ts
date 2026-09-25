// saas/app/api/cron/cos-university-mass-backlog-compact/route.ts
import { NextRequest,NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { compactMassEvaluationBacklog } from '@/lib/ai/cos/cosUniversityMassBacklogCompactor'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'
import { describeThrownValue } from '@/lib/ai/cos/describeThrownValue'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60

const LANE='cos-university-mass-backlog-compactor'
const laneStatus=(outcome:'worked'|'skipped'|'failed',reason:string,detail?:Record<string,unknown>)=>
  recordCosLaneStatus({db:cosServiceDb(),lane:LANE,outcome,reason,detail})

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`){
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401})
  }
  try{
    const result=await compactMassEvaluationBacklog({db:cosServiceDb()})
    if(result.retired.length===0){
      await laneStatus('skipped','no_proven_superseded_mass_artifacts',{limit:result.limit,retired:0})
      return NextResponse.json({ok:true,retired:0,reason:'no_proven_superseded_mass_artifacts',limit:result.limit})
    }
    await laneStatus('worked','proven_superseded_mass_artifacts_retired',{
      limit:result.limit,
      retired:result.retired.length,
      candidates:result.retired.slice(0,10).map(row=>row.retired_candidate_id),
    })
    return NextResponse.json({ok:true,retired:result.retired.length,limit:result.limit,rows:result.retired})
  }catch(error){
    const message=describeThrownValue(error,300)
    await laneStatus('failed','mass_backlog_compactor_failed',{error:message})
    return NextResponse.json({ok:false,error:message},{status:500})
  }
}
