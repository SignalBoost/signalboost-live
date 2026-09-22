import type { SupabaseClient } from '@supabase/supabase-js'
import type { BuilderResidencyEvidenceStore } from './builder-case-runner.ts'

export function createSupabaseBuilderResidencyEvidenceStore(
  db:SupabaseClient,
):BuilderResidencyEvidenceStore{
  return Object.freeze({
    async startCase(input){
      const {data,error}=await db.from('cos_university_residency_case_runs').insert({
        residency_id:input.residencyId,
        run_id:input.runId,
        case_family:input.caseFamily,
        variant_hash:input.variantHash,
        competency_id:input.competencyId,
        artifact_hash:input.artifactHash,
        environment_id:input.environmentId,
        status:'started',
        final_exam_material_used:false,
        authority_expanded:false,
        production_mutation_observed:false,
      }).select('id').single()
      if(error) throw error
      return {caseRunId:String(data.id)}
    },
    async finishCase(input){
      const {error}=await db.from('cos_university_residency_case_runs').update({
        status:input.status,
        harness_outcome:input.harnessOutcome,
        verifier_ref:input.verifierRef??null,
        trajectory_hash:input.trajectoryHash??null,
        evidence_hash:input.evidenceHash??null,
        failure_code:input.failureCode??null,
        completed_at:new Date().toISOString(),
      }).eq('id',input.caseRunId)
      if(error) throw error
    },
    async recordCompetency(input){
      const {error}=await db.from('cos_university_residency_competency_evidence').insert({
        residency_id:input.residencyId,
        case_run_id:input.caseRunId,
        competency_id:input.competencyId,
        case_family:input.caseFamily,
        variant_hash:input.variantHash,
        trajectory_hash:input.trajectoryHash,
        evidence_hash:input.evidenceHash,
        outcome:input.outcome,
        observed_at:input.observedAt,
      })
      if(error) throw error
    },
  })
}
