import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidencyEvidenceForAssessment, ResidencyStanding } from '../../lib/ai/cos/cosUniversityResidency.ts'
import type {
  BuilderResidencyEnrollment,
  BuilderResidencyOrchestratorStore,
} from './orchestrator.ts'
import { createSupabaseBuilderResidencyEvidenceStore } from './supabase-store.ts'
import { refreshBuilderResidencyAssessment } from './assessment-store.ts'

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
      const {data,error}=await input.db
        .from('cos_university_residency_enrollments')
        .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,standing')
        .in('standing',['resident','senior_resident','remediation_required'])
        .order('updated_at',{ascending:true})
        .limit(1)
        .maybeSingle()
      if(error) throw error
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
        accepted:true,
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
