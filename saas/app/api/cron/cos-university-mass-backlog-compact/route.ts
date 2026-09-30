import { NextRequest,NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { compactMassEvaluationBacklog } from '@/lib/ai/cos/cosUniversityMassBacklogCompactor'
import { reviewMassQuarantine } from '@/lib/ai/cos/cosUniversityMassQuarantineReview'
import { resolveQuarantine } from '@/lib/ai/cos/cosUniversityQuarantineResolution'
import { QUARANTINE_RESOLUTION_LANE } from '@/lib/ai/cos/cosUniversityQuarantineReasons'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { describeThrownValue } from '@/lib/ai/cos/describeThrownValue'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=120

const LANE='cos-university-mass-backlog-compactor'
const REVIEW_LANE='cos-university-mass-quarantine-review'
const laneStatus=(outcome:'worked'|'skipped'|'failed',reason:string,detail?:Record<string,unknown>)=>
  recordCosLaneStatus({db:cosServiceDb(),lane:LANE,outcome,reason,detail})

/**
 * Quarantine review first (owner direction 2026-09-29): students quarantined only because our own infrastructure
 * failures were once counted against them get their exam back. Real FAILs stay final. It runs on its own: a review
 * failure never stops compaction, and compaction never undoes a restore (it retires only untouched predecessors).
 */
async function reviewQuarantine(){
  try{
    const review=await reviewMassQuarantine()
    await recordCosLaneStatus({
      db:cosServiceDb(),
      lane:REVIEW_LANE,
      outcome:review.restored>0?'worked':'skipped',
      reason:review.restored>0?'wrongly_exhausted_students_restored_to_pending':'no_wrongly_exhausted_students',
      detail:review,
    })
    return review
  }catch(error){
    const message=describeThrownValue(error,300)
    await recordCosLaneStatus({db:cosServiceDb(),lane:REVIEW_LANE,outcome:'failed',reason:'mass_quarantine_review_failed',detail:{error:message}}).catch(()=>null)
    return {error:message}
  }
}

/**
 * Quarantine resolution next (owner direction 2026-09-30): "if they are there because of our infrastructure fix it -
 * if because they are incompetent delete them." Proven FAILs leave the University, our-fault students go back to the
 * exam, so nobody stays in quarantine. Runs on its own, after the review: a failure here never stops compaction.
 */
async function resolveQuarantineStep(){
  try{
    const resolution=await resolveQuarantine({db:cosServiceDb()})
    const changed=resolution.dismissed+resolution.returnedToExam
    await recordCosLaneStatus({
      db:cosServiceDb(),
      lane:QUARANTINE_RESOLUTION_LANE,
      outcome:changed>0?'worked':'skipped',
      reason:changed>0?'quarantine_resolved':'nothing_to_resolve',
      detail:resolution,
    })
    return resolution
  }catch(error){
    const message=describeThrownValue(error,300)
    await recordCosLaneStatus({db:cosServiceDb(),lane:QUARANTINE_RESOLUTION_LANE,outcome:'failed',reason:'quarantine_resolution_failed',detail:{error:message}}).catch(()=>null)
    return {error:message}
  }
}

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`){
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401})
  }
  const quarantineReview=await reviewQuarantine()
  const quarantineResolution=await resolveQuarantineStep()
  try{
    const result=await compactMassEvaluationBacklog({db:cosServiceDb()})
    if(result.retired.length===0){
      await laneStatus('skipped','no_proven_superseded_mass_artifacts',{limit:result.limit,retired:0})
      await recordCosUniversityProductionPath({
        path:'mass_backlog_compaction',
        invocationSucceeded:true,
        evidence:{runnerInvoked:true,retired:0,limit:result.limit,noProvenSupersededArtifacts:true,quarantineReview,quarantineResolution,authorityExpanded:false},
      })
      return NextResponse.json({ok:true,retired:0,reason:'no_proven_superseded_mass_artifacts',limit:result.limit,quarantineReview,quarantineResolution})
    }
    await laneStatus('worked','proven_superseded_mass_artifacts_retired',{
      limit:result.limit,
      retired:result.retired.length,
      candidates:result.retired.slice(0,10).map(row=>row.retired_candidate_id),
    })
    await recordCosUniversityProductionPath({
      path:'mass_backlog_compaction',
      invocationSucceeded:true,
      evidence:{
        runnerInvoked:true,
        retired:result.retired.length,
        limit:result.limit,
        retiredCandidates:result.retired.slice(0,10).map(row=>row.retired_candidate_id),
        quarantineReview,
        quarantineResolution,
        authorityExpanded:false,
      },
    })
    return NextResponse.json({ok:true,retired:result.retired.length,limit:result.limit,rows:result.retired,quarantineReview,quarantineResolution})
  }catch(error){
    const message=describeThrownValue(error,300)
    await laneStatus('failed','mass_backlog_compactor_failed',{error:message})
    await recordCosUniversityProductionPath({
      path:'mass_backlog_compaction',
      invocationSucceeded:false,
      evidence:{runnerInvoked:true,error:message,quarantineReview,quarantineResolution,authorityExpanded:false},
    }).catch(()=>null)
    return NextResponse.json({ok:false,error:message,quarantineReview,quarantineResolution},{status:500})
  }
}
