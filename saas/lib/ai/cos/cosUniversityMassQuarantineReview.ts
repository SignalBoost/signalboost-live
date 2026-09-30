// saas/lib/ai/cos/cosUniversityMassQuarantineReview.ts
// Restore only mass-evaluation students that were quarantined by the exhausted-attempt sweep
// but whose historical failures are no longer substantive under the current evaluator policy.
// Real evaluation verdicts and unrelated quarantine reasons are never reopened.

import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  decideWronglyExhaustedMassEvaluationArtifacts,
  type RollingArtifact,
  type RollingEvent,
} from './cosUniversityMassEvaluationRollingAuthority'

const PROFILE='cos_mass_distilled_independent_evaluation_runtime_v1'
const EXHAUSTED='mass_distilled_evaluation_attempts_exhausted'
const REVIEW_PROFILE='cos_mass_quarantine_review_v1'
const RESTORED='mass_distilled_evaluation_quarantine_restored'
const PAGE_SIZE=1000
const MAX_PAGES=20
const HEX64=/^[a-f0-9]{64}$/i

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

type ArtifactRow={
  candidate_id:unknown
  subject_id:unknown
  trained_artifact_hash:unknown
  created_at:unknown
}

type EventRow={
  candidate_id:unknown
  observed_at:unknown
  expires_at:unknown
  verifier:unknown
  evidence:unknown
}

async function readEvents(db:any,candidateIds:readonly string[]):Promise<RollingEvent[]>{
  const out:RollingEvent[]=[]
  for(let offset=0;offset<PAGE_SIZE*MAX_PAGES;offset+=PAGE_SIZE){
    const page=await db.from('cos_university_learning_assurance_events')
      .select('candidate_id,observed_at,expires_at,verifier,evidence')
      .in('candidate_id',[...candidateIds])
      .order('observed_at',{ascending:true})
      .range(offset,offset+PAGE_SIZE-1)
    if(page.error) throw page.error
    const rows=(page.data??[]) as EventRow[]
    for(const row of rows){
      const evidence=row.evidence&&typeof row.evidence==='object'&&!Array.isArray(row.evidence)
        ? row.evidence as Record<string,unknown>
        : null
      out.push(Object.freeze({
        candidateId:String(row.candidate_id??''),
        observedAt:String(row.observed_at??''),
        expiresAt:row.expires_at==null?null:String(row.expires_at),
        verifier:String(row.verifier??''),
        evidence,
      }))
    }
    if(rows.length<PAGE_SIZE) break
  }
  return out
}

export async function reviewMassQuarantine():Promise<Readonly<{
  checked:number
  eligible:number
  restored:number
  candidateIds:readonly string[]
}>>{
  const db=cosServiceDb()
  if(!db) throw new Error('service_database_unavailable')

  // Only students still quarantined AND carrying our exact exhausted-attempt disposition are candidates.
  // Residency failures, terminal holdout-data defects, explicit merit verdicts and every other quarantine stay untouched.
  const disposed=await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,evidence')
    .eq('verifier','host_controller')
    .eq('evidence->>profile',PROFILE)
    .eq('evidence->>claim',EXHAUSTED)
    .order('observed_at',{ascending:true})
    .limit(1000)
  if(disposed.error) throw disposed.error

  const disposedIds=[...new Set((disposed.data??[])
    .map((row:any)=>String(row.candidate_id??''))
    .filter((id:string)=>id.startsWith('mass:')))]
  if(!disposedIds.length) return Object.freeze({checked:0,eligible:0,restored:0,candidateIds:Object.freeze([])})

  const artifacts=await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,created_at')
    .in('candidate_id',disposedIds)
    .eq('status','quarantined')
    .like('candidate_id','mass:%')
    .limit(1000)
  if(artifacts.error) throw artifacts.error

  const rows=(artifacts.data??[]) as ArtifactRow[]
  const rolling:RollingArtifact[]=rows
    .map(row=>({
      candidateId:String(row.candidate_id??''),
      subjectId:String(row.subject_id??''),
      artifactHash:String(row.trained_artifact_hash??'').toLowerCase(),
      createdAt:String(row.created_at??''),
    }))
    .filter(row=>HEX64.test(row.artifactHash))

  if(!rolling.length) return Object.freeze({checked:rows.length,eligible:0,restored:0,candidateIds:Object.freeze([])})

  const events=await readEvents(db,rolling.map(row=>row.candidateId))
  const eligible=decideWronglyExhaustedMassEvaluationArtifacts({artifacts:rolling,events,now:new Date()})
  const restored:string[]=[]

  for(const item of eligible){
    // Recheck the exact exhausted disposition at write time. The conditional artifact update makes retries idempotent.
    const disposition=(disposed.data??[]).some((row:any)=>
      String(row.candidate_id??'')===item.candidateId
      && row.evidence?.profile===PROFILE
      && row.evidence?.claim===EXHAUSTED)
    if(!disposition) continue

    const now=new Date().toISOString()
    const updated=await db.from('cos_local_distillation_artifacts')
      .update({status:'evaluation_pending',updated_at:now})
      .eq('candidate_id',item.candidateId)
      .eq('trained_artifact_hash',item.artifactHash)
      .eq('status','quarantined')
      .select('id')
    if(updated.error) throw updated.error
    if(!(updated.data??[]).length) continue

    const body={
      profile:REVIEW_PROFILE,
      claim:RESTORED,
      candidateId:item.candidateId,
      artifactHash:item.artifactHash,
      priorDisposition:EXHAUSTED,
      currentSubstantiveFailures:item.substantiveFailures,
      lastError:item.lastError,
      nextStatus:'evaluation_pending',
      evaluationPassed:false,
      productionTrafficAuthorized:false,
      authorityExpanded:false,
    }
    const event=await db.from('cos_university_learning_assurance_events').upsert({
      event_key:hash([REVIEW_PROFILE,RESTORED,item.candidateId,item.artifactHash]),
      event_type:'fine_tune',
      subject_id:item.subjectId||null,
      candidate_id:item.candidateId,
      evidence_hash:hash(body),
      evidence:body,
      verifier:'host_controller',
      observed_at:now,
    },{onConflict:'event_key',ignoreDuplicates:true})
    if(event.error) throw event.error
    restored.push(item.candidateId)
  }

  return Object.freeze({
    checked:rolling.length,
    eligible:eligible.length,
    restored:restored.length,
    candidateIds:Object.freeze(restored),
  })
}
