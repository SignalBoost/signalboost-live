import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidencyEvidenceForAssessment, ResidencyStanding } from '../../lib/ai/cos/cosUniversityResidency.ts'
import type {
  BuilderResidencyEnrollment,
  BuilderResidencyOrchestratorStore,
} from './orchestrator.ts'
import { createSupabaseBuilderResidencyEvidenceStore } from './supabase-store.ts'
import { refreshBuilderResidencyAssessment } from './assessment-store.ts'
import { isRetiredBuilderResidencyVariant } from '../cases/builder-residency.ts'

export const BUILDER_RESIDENCY_WARM_RETRY_WINDOW_MS=15*60_000

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

export function createSupabaseBuilderResidencyOrchestratorStore(input:{
  db:SupabaseClient
  tenantId:string
  portableId:string
  agentId:string
  sandboxEnvironmentId:string
}):BuilderResidencyOrchestratorStore{
  const evidenceStore=createSupabaseBuilderResidencyEvidenceStore(input.db)
  return Object.freeze({
    ...evidenceStore,

    async nextEnrollment():Promise<BuilderResidencyEnrollment|null>{
      const active=await input.db
        .from('cos_university_residency_enrollments')
        .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,standing,updated_at')
        .in('standing',['resident','senior_resident','remediation_required'])
        .order('updated_at',{ascending:true})
        .limit(32)
      if(active.error) throw active.error
      const enrollments=active.data??[]
      if(!enrollments.length) return null

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

      const data=selectBuilderResidencyEnrollmentForTick({
        enrollments,
        recentCases:recent.data??[],
        now:new Date(),
      })
      if(!data) return null
      return Object.freeze({
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
    },

    async readEvidence(residencyId:string):Promise<readonly ResidencyEvidenceForAssessment[]>{
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
    },

    async refreshAssessment(residencyId:string){
      return refreshBuilderResidencyAssessment({
        db:input.db,
        residencyId,
      })
    },
  })
}
