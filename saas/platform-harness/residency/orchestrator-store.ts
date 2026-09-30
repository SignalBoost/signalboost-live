// saas/platform-harness/residency/orchestrator-store.ts
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidencyEvidenceForAssessment, ResidencyStanding } from '../../lib/ai/cos/cosUniversityResidency.ts'
import {
  unrecoverableBuilderResidencyCompetencies,
  type BuilderResidencyEnrollment,
  type BuilderResidencyOrchestratorStore,
  type UnrecoverableResidencyCompetency,
} from './orchestrator.ts'
import { createSupabaseBuilderResidencyEvidenceStore } from './supabase-store.ts'
import { refreshBuilderResidencyAssessment } from './assessment-store.ts'
import { isRetiredBuilderResidencyVariant } from '../cases/builder-residency.ts'

export const BUILDER_RESIDENCY_WARM_RETRY_WINDOW_MS=15*60_000
export const BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE='cos_builder_residency_final_disposition_v1' as const
export const BUILDER_RESIDENCY_FAILED_CLAIM='builder_residency_failed' as const
export const BUILDER_RESIDENCY_WITHDRAWN_CLAIM='builder_residency_withdrawn' as const
/** Terminal, not a verdict: the student left the University while in Residency (its artifact is no longer pending). */
export const BUILDER_RESIDENCY_WITHDRAWN_STANDING='withdrawn' as const
const ACTIVE_RESIDENCY_STANDINGS=['resident','senior_resident','remediation_required'] as const
const RESIDENCY_FAILURE_SWEEP_LIMIT=200
const ENROLLMENT_COLUMNS='id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,standing,updated_at'

const sha256=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

export type BuilderResidencyFailureSweep=Readonly<{
  checked:number
  closedResidencyIds:readonly string[]
  quarantinedArtifacts:number
  errors:readonly string[]
}>

export type BuilderResidencyWithdrawalSweep=Readonly<{
  checked:number
  withdrawnResidencyIds:readonly string[]
  errors:readonly string[]
}>

export type SupabaseBuilderResidencyOrchestratorStore=BuilderResidencyOrchestratorStore&Readonly<{
  closeUnrecoverableResidencies():Promise<BuilderResidencyFailureSweep>
  /** Closes active enrollments whose student already left the University (see withdrawDepartedResidencies). */
  withdrawDepartedResidencies():Promise<BuilderResidencyWithdrawalSweep>
  /** Up to `laneCount` distinct active residents for this tick, one lane each (see selectBuilderResidencyLanes). */
  planLanes(laneCount:number):Promise<readonly BuilderResidencyEnrollment[]>
  /** The same store, but every case turn goes to this one resident while it is still active. */
  pinnedTo(enrollment:BuilderResidencyEnrollment):BuilderResidencyOrchestratorStore
}>

type ResidencySchedulerCaseRow=Readonly<{
  residency_id:unknown
  harness_outcome:unknown
  completed_at:unknown
}>

/**
 * Give one recently infrastructure-blocked resident the immediately following tick so a worker
 * that finished cold-starting just after the bounded readiness window is not discarded. A second
 * CONSECUTIVE infrastructure failure rotates away, preserving cohort fairness.
 *
 * Consecutive failures are counted across the resident's whole recent history, not only inside the
 * warm window. Production, 2026-09-26 16:32-21:12 UTC: ticks run every 10 minutes and a failed tick
 * finishes within seconds, so a 15-minute window only ever contained ONE prior failure. The resident
 * therefore always looked like a first failure and was retried on every tick for 5 hours (29 identical
 * infrastructure rejections) while three remediation residents were never scheduled.
 */
export function selectBuilderResidencyEnrollmentForTick<T extends {id:unknown}>(input:{
  enrollments:readonly T[]
  recentCases:readonly ResidencySchedulerCaseRow[]
  now?:Date
}):T|null{
  const fallback=input.enrollments[0]??null
  if(!fallback) return null

  // A newly admitted resident must receive its first practical case before residents
  // with retry history consume another turn. Without this, long-running residents can
  // keep brand-new admissions idle even though they already consume active capacity.
  const residentsWithHistory=new Set(
    input.recentCases.map(row=>String(row.residency_id??'')).filter(Boolean),
  )
  const unstarted=input.enrollments.filter(row=>!residentsWithHistory.has(String(row.id)))
  // A single zero-case enrollment is a genuinely new admission and should not be starved by an
  // older resident's retry history. When several enrollments have no history, however, treating
  // the first one as "new" would suppress the deliberately allowed one-tick warm retry and make
  // scheduling depend on array order. Let the retry/fairness logic below choose in that case.
  if(unstarted.length===1) return unstarted[0]

  const latest=input.recentCases[0]
  if(!latest||String(latest.harness_outcome)!=='infrastructure_failure') return fallback
  const residencyId=String(latest.residency_id??'')
  if(!residencyId) return fallback
  const completedMs=Date.parse(String(latest.completed_at??''))
  const nowMs=(input.now??new Date()).getTime()
  const warm=Number.isFinite(completedMs)&&nowMs-completedMs<=BUILDER_RESIDENCY_WARM_RETRY_WINDOW_MS

  let consecutiveInfrastructureFailures=0
  for(const row of input.recentCases){
    if(String(row.residency_id??'')!==residencyId) continue
    if(String(row.harness_outcome)!=='infrastructure_failure') break
    consecutiveInfrastructureFailures+=1
  }

  if(warm&&consecutiveInfrastructureFailures===1){
    return input.enrollments.find(row=>String(row.id)===residencyId)??fallback
  }
  return input.enrollments.find(row=>String(row.id)!==residencyId)??fallback
}

/**
 * A worker that finished a case this recently is still up: the exact-artifact runtime idles 12 minutes before it
 * scales to zero and the Residency tick runs every 10 minutes.
 */
export const BUILDER_RESIDENCY_LANE_WARM_WINDOW_MS=11*60_000

/**
 * Residency lanes (owner direction 2026-09-30, pipeline worked backwards: Residency remediation, then residents).
 *
 * Production before this: ONE case per tick for the whole cohort, each turn given to the resident with the oldest
 * update, so consecutive cases went to different residents and every case paid a cold start of a different exact
 * artifact, then left that worker idle (and billed) for 12 minutes. A resident needs at least 26 passing cases.
 *
 * Now each tick runs one lane per resident, in parallel, and a resident keeps its lane tick after tick. Its worker is
 * reused while warm, so it pays one cold start for its Residency instead of one per case. Order: remediation first,
 * then residents whose worker is still warm, then brand-new admissions, then everyone else oldest-first; a resident
 * whose last two cases were infrastructure failures goes last. Scheduling only: every case still crosses the same
 * authority, harness and evidence boundaries, and the standard is unchanged.
 */
export function selectBuilderResidencyLanes<T extends {id:unknown;standing?:unknown}>(input:{
  enrollments:readonly T[]
  recentCases:readonly ResidencySchedulerCaseRow[]
  laneCount:number
  now?:Date
}):T[]{
  const nowMs=(input.now??new Date()).getTime()
  const casesByResident=new Map<string,ResidencySchedulerCaseRow[]>()
  for(const row of input.recentCases){
    const id=String(row.residency_id??'')
    if(!id) continue
    const list=casesByResident.get(id)??[]
    list.push(row)
    casesByResident.set(id,list)
  }
  const ranked=input.enrollments.map((row,index)=>{
    // recentCases arrive newest first.
    const cases=casesByResident.get(String(row.id))??[]
    const latestMs=Date.parse(String(cases[0]?.completed_at??''))
    const warm=Number.isFinite(latestMs)&&nowMs-latestMs<=BUILDER_RESIDENCY_LANE_WARM_WINDOW_MS
    let infrastructureStreak=0
    for(const item of cases){
      if(String(item.harness_outcome)!=='infrastructure_failure') break
      infrastructureStreak+=1
    }
    const key=[
      infrastructureStreak>=2?1:0,
      String(row.standing)==='remediation_required'?0:1,
      warm?0:1,
      cases.length===0?0:1,
      index,
    ]
    return {row,key}
  })
  ranked.sort((a,b)=>{
    for(let i=0;i<a.key.length;i+=1) if(a.key[i]!==b.key[i]) return a.key[i]-b.key[i]
    return 0
  })
  const lanes=Math.max(1,Math.floor(Number(input.laneCount)||1))
  return ranked.slice(0,lanes).map(item=>item.row)
}

export function createSupabaseBuilderResidencyOrchestratorStore(input:{
  db:SupabaseClient
  tenantId:string
  portableId:string
  agentId:string
  sandboxEnvironmentId:string
}):SupabaseBuilderResidencyOrchestratorStore{
  const evidenceStore=createSupabaseBuilderResidencyEvidenceStore(input.db)

  const toEnrollment=(data:any):BuilderResidencyEnrollment=>Object.freeze({
    residencyId:String(data.id),
    candidateId:String(data.candidate_id),
    subjectId:String(data.subject_id),
    tenantId:input.tenantId,
    portableId:input.portableId,
    agentId:input.agentId,
    artifactId:String(data.trained_artifact_id),
    artifactHash:String(data.trained_artifact_hash),
    artifactRevision:String(data.revision_key),
    sandboxEnvironmentId:input.sandboxEnvironmentId,
    standing:String(data.standing) as ResidencyStanding,
  })

  async function readEvidence(residencyId:string):Promise<readonly ResidencyEvidenceForAssessment[]>{
    const {data,error}=await input.db
      .from('cos_university_residency_competency_evidence')
      .select('competency_id,variant_hash,outcome,observed_at')
      .eq('residency_id',residencyId)
      .order('observed_at',{ascending:true})
    if(error) throw error
    return Object.freeze((data??[]).map(row=>Object.freeze({
      competencyId:String(row.competency_id),
      variantHash:String(row.variant_hash),
      outcome:String(row.outcome)==='fail'?'fail' as const:'pass' as const,
      observedAt:String(row.observed_at),
      // Evidence from a retired (trivially passing) variant proves nothing and never counts.
      accepted:!isRetiredBuilderResidencyVariant(String(row.variant_hash)),
    })))
  }

  /**
   * Record the terminal Residency FAIL: the evidence of WHY first (idempotent on a deterministic key), then
   * the student's artifact verdict (quarantined, only from evaluation_pending), then the enrollment standing
   * (only from an active standing). Every step is conditional, so a retry after a partial failure repeats
   * nothing and completes the rest. This records an educational result; it never evaluates, scores,
   * promotes, spends or touches Production.
   */
  async function closeFailedResidency(close:{
    enrollment:BuilderResidencyEnrollment
    competencies:readonly UnrecoverableResidencyCompetency[]
  }):Promise<{closed:boolean;artifactQuarantined:boolean}>{
    const now=new Date().toISOString()
    const enrollment=close.enrollment
    const body={
      profile:BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE,
      claim:BUILDER_RESIDENCY_FAILED_CLAIM,
      residencyId:enrollment.residencyId,
      candidateId:enrollment.candidateId,
      artifactHash:enrollment.artifactHash,
      failedCompetencies:close.competencies.map(item=>({
        competencyId:item.competencyId,
        passesAfterLastFailure:item.passesAfterLastFailure,
        untriedVariants:item.untriedVariants,
        attempts:item.attempts,
      })),
      requirement:'after a failure, two distinct later passes on different variants; each variant is attempted once',
      nextStatus:'quarantined',
      nextStanding:'residency_failed',
      terminalDisposition:true,
      evaluationPassed:false,
      productionTrafficAuthorized:false,
      authorityExpanded:false,
    }
    const event=await input.db.from('cos_university_learning_assurance_events').upsert({
      event_key:sha256([BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE,BUILDER_RESIDENCY_FAILED_CLAIM,enrollment.residencyId]),
      event_type:'fine_tune',
      subject_id:enrollment.subjectId||null,
      candidate_id:enrollment.candidateId,
      evidence_hash:sha256(body),
      evidence:body,
      verifier:'host_controller',
      observed_at:now,
    },{onConflict:'event_key',ignoreDuplicates:true})
    if(event.error) throw event.error

    const artifact=await input.db.from('cos_local_distillation_artifacts')
      .update({status:'quarantined',updated_at:now})
      .eq('candidate_id',enrollment.candidateId)
      .eq('trained_artifact_hash',enrollment.artifactHash)
      .eq('status','evaluation_pending')
      .select('id')
    if(artifact.error) throw artifact.error

    const standing=await input.db.from('cos_university_residency_enrollments')
      .update({standing:'residency_failed',updated_at:now})
      .eq('id',enrollment.residencyId)
      .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
      .select('id')
    if(standing.error) throw standing.error

    return {closed:(standing.data??[]).length>0,artifactQuarantined:(artifact.data??[]).length>0}
  }

  // Active residents and their recent case history: the single source both schedulers read.
  /**
   * Residency practises on the exact artifact of a student still waiting for its final exam. Production 2026-09-30:
   * all 10 active residents' artifacts were `retired` (a newer student of the identical training lineage had already
   * passed its exam, so the backlog compactor retired them) while their enrollments stayed active. Every case then
   * stopped on residency_exact_artifact_registry_mismatch: 24 case turns in one hour, 0 passes. Returns the keys
   * (candidateId:hash) of the given enrollments whose student is still evaluation_pending.
   */
  async function stillWaitingStudents(enrollments:readonly any[]):Promise<Set<string>>{
    const waiting=new Set<string>()
    const candidateIds=[...new Set(enrollments.map(row=>String(row.candidate_id??'')).filter(Boolean))]
    for(let offset=0;offset<candidateIds.length;offset+=75){
      const artifacts=await input.db
        .from('cos_local_distillation_artifacts')
        .select('candidate_id,trained_artifact_hash,status')
        .in('candidate_id',candidateIds.slice(offset,offset+75))
        .eq('status','evaluation_pending')
      if(artifacts.error) throw artifacts.error
      for(const row of artifacts.data??[]){
        waiting.add(`${String((row as any).candidate_id)}:${String((row as any).trained_artifact_hash).toLowerCase()}`)
      }
    }
    return waiting
  }
  const enrollmentKey=(row:any)=>`${String(row.candidate_id)}:${String(row.trained_artifact_hash).toLowerCase()}`

  async function readSchedulingState(){
    const active=await input.db
      .from('cos_university_residency_enrollments')
      .select(ENROLLMENT_COLUMNS)
      .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
      .order('updated_at',{ascending:true})
      .limit(32)
    if(active.error) throw active.error
    const listed=(active.data??[]) as any[]
    // A resident whose student already left gets no case turn, even before its enrollment is closed.
    const waiting=listed.length?await stillWaitingStudents(listed):new Set<string>()
    const enrollments=listed.filter(row=>waiting.has(enrollmentKey(row)))
    if(!enrollments.length) return {enrollments,recentCases:[] as ResidencySchedulerCaseRow[]}
    const residencyIds=enrollments.map(row=>String(row.id))
    // Full recent history (not only the warm window): consecutive failures must be countable.
    const recent=await input.db
      .from('cos_university_residency_case_runs')
      .select('residency_id,harness_outcome,completed_at')
      .in('residency_id',residencyIds)
      .not('completed_at','is',null)
      .order('completed_at',{ascending:false})
      .limit(64)
    if(recent.error) throw recent.error
    return {enrollments,recentCases:(recent.data??[]) as ResidencySchedulerCaseRow[]}
  }

  const base={
    ...evidenceStore,

    closeFailedResidency,

    /**
     * One pass over every active resident, run once per tick before admission and case selection, so all
     * residents whose result is already certain leave the queue at once instead of one per case turn.
     * A failure on one resident is reported and never blocks the others or the rest of the tick.
     */
    /**
     * Close every active enrollment whose student is no longer waiting for its exam: standing `withdrawn`, with a
     * durable record of why. Not a Residency FAIL and not a pass; the seat is freed for a student that can practise.
     * The record is written first (idempotent key), the standing change is conditional on still being active, and a
     * failure on one resident never blocks the others.
     */
    async withdrawDepartedResidencies():Promise<BuilderResidencyWithdrawalSweep>{
      const active=await input.db
        .from('cos_university_residency_enrollments')
        .select(ENROLLMENT_COLUMNS)
        .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
        .limit(RESIDENCY_FAILURE_SWEEP_LIMIT)
      if(active.error) throw active.error
      const rows=(active.data??[]) as any[]
      if(!rows.length) return Object.freeze({checked:0,withdrawnResidencyIds:Object.freeze([]),errors:Object.freeze([])})
      const waiting=await stillWaitingStudents(rows)
      const withdrawnResidencyIds:string[]=[]
      const errors:string[]=[]
      for(const row of rows){
        if(waiting.has(enrollmentKey(row))) continue
        const enrollment=toEnrollment(row)
        try{
          const current=await input.db
            .from('cos_local_distillation_artifacts')
            .select('status')
            .eq('candidate_id',enrollment.candidateId)
            .eq('trained_artifact_hash',enrollment.artifactHash)
            .maybeSingle()
          if(current.error) throw current.error
          const artifactStatus=current.data?String((current.data as any).status):'missing'
          if(artifactStatus==='evaluation_pending') continue
          const now=new Date().toISOString()
          const body={
            profile:BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE,
            claim:BUILDER_RESIDENCY_WITHDRAWN_CLAIM,
            residencyId:enrollment.residencyId,
            candidateId:enrollment.candidateId,
            artifactHash:enrollment.artifactHash,
            previousStanding:enrollment.standing,
            artifactStatus,
            reason:'student_left_university',
            nextStanding:BUILDER_RESIDENCY_WITHDRAWN_STANDING,
            terminalDisposition:true,
            evaluationPassed:false,
            productionTrafficAuthorized:false,
            authorityExpanded:false,
          }
          const event=await input.db.from('cos_university_learning_assurance_events').upsert({
            event_key:sha256([BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE,BUILDER_RESIDENCY_WITHDRAWN_CLAIM,enrollment.residencyId]),
            event_type:'fine_tune',
            subject_id:enrollment.subjectId||null,
            candidate_id:enrollment.candidateId,
            evidence_hash:sha256(body),
            evidence:body,
            verifier:'host_controller',
            observed_at:now,
          },{onConflict:'event_key',ignoreDuplicates:true})
          if(event.error) throw event.error
          const standing=await input.db.from('cos_university_residency_enrollments')
            .update({standing:BUILDER_RESIDENCY_WITHDRAWN_STANDING,updated_at:now})
            .eq('id',enrollment.residencyId)
            .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
            .select('id')
          if(standing.error) throw standing.error
          if((standing.data??[]).length) withdrawnResidencyIds.push(enrollment.residencyId)
        }catch(error){
          const message=error instanceof Error?error.message:String((error as any)?.message??error)
          errors.push(`${enrollment.residencyId.slice(0,8)}:${message.slice(0,200)}`)
        }
      }
      return Object.freeze({
        checked:rows.length,
        withdrawnResidencyIds:Object.freeze(withdrawnResidencyIds),
        errors:Object.freeze(errors),
      })
    },

    async closeUnrecoverableResidencies():Promise<BuilderResidencyFailureSweep>{
      const active=await input.db
        .from('cos_university_residency_enrollments')
        .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,standing,updated_at')
        .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
        .order('updated_at',{ascending:true})
        .limit(RESIDENCY_FAILURE_SWEEP_LIMIT)
      if(active.error) throw active.error
      const closedResidencyIds:string[]=[]
      const errors:string[]=[]
      let quarantinedArtifacts=0
      for(const row of active.data??[]){
        const enrollment=toEnrollment(row)
        try{
          const competencies=unrecoverableBuilderResidencyCompetencies({evidence:await readEvidence(enrollment.residencyId)})
          if(!competencies.length) continue
          const closure=await closeFailedResidency({enrollment,competencies})
          if(closure.closed) closedResidencyIds.push(enrollment.residencyId)
          if(closure.artifactQuarantined) quarantinedArtifacts+=1
        }catch(error){
          const message=error instanceof Error?error.message:String((error as any)?.message??error)
          errors.push(`${enrollment.residencyId.slice(0,8)}:${message.slice(0,200)}`)
        }
      }
      return Object.freeze({
        checked:(active.data??[]).length,
        closedResidencyIds:Object.freeze(closedResidencyIds),
        quarantinedArtifacts,
        errors:Object.freeze(errors),
      })
    },

    async nextEnrollment():Promise<BuilderResidencyEnrollment|null>{
      const {enrollments,recentCases}=await readSchedulingState()
      if(!enrollments.length) return null
      const data=selectBuilderResidencyEnrollmentForTick({
        enrollments,
        recentCases,
        now:new Date(),
      })
      if(!data) return null
      return toEnrollment(data)
    },

    readEvidence,

    async refreshAssessment(residencyId:string){
      return refreshBuilderResidencyAssessment({
        db:input.db,
        residencyId,
      })
    },
  }

  return Object.freeze({
    ...base,

    async planLanes(laneCount:number):Promise<readonly BuilderResidencyEnrollment[]>{
      const {enrollments,recentCases}=await readSchedulingState()
      if(!enrollments.length) return Object.freeze([])
      return Object.freeze(selectBuilderResidencyLanes({enrollments,recentCases,laneCount,now:new Date()}).map(toEnrollment))
    },

    pinnedTo(enrollment:BuilderResidencyEnrollment):BuilderResidencyOrchestratorStore{
      return Object.freeze({
        ...base,
        // Re-read on every turn: a resident that completed, failed or was closed mid-tick gets no further case.
        async nextEnrollment():Promise<BuilderResidencyEnrollment|null>{
          const current=await input.db
            .from('cos_university_residency_enrollments')
            .select(ENROLLMENT_COLUMNS)
            .eq('id',enrollment.residencyId)
            .in('standing',[...ACTIVE_RESIDENCY_STANDINGS])
            .maybeSingle()
          if(current.error) throw current.error
          return current.data?toEnrollment(current.data):null
        },
      })
    },
  })
}