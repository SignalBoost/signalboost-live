import type { SupabaseClient } from '@supabase/supabase-js'
import { BUILDER_RESIDENCY_PROGRAM_ID, COS_UNIVERSITY_RESIDENCY_VERSION, decideResidencyAdmission, type ResidencyAdmissionInput } from '../../lib/ai/cos/cosUniversityResidency.ts'

export async function admitBuilderResidency(input:{db:SupabaseClient;admission:ResidencyAdmissionInput;admissionEvidenceHash:string}){
  const decision=decideResidencyAdmission(input.admission)
  if(!decision.eligible) return Object.freeze({ok:false as const,reason:'residency_admission_rejected',blockers:decision.blockers})
  if(!/^[a-f0-9]{64}$/i.test(input.admissionEvidenceHash)) return Object.freeze({ok:false as const,reason:'residency_admission_evidence_invalid',blockers:Object.freeze(['residency_admission_evidence_invalid'])})
  const row={artifact_row_id:input.admission.artifactRowId,candidate_id:input.admission.candidateId,subject_id:input.admission.subjectId,trained_artifact_id:input.admission.trainedArtifactId,trained_artifact_hash:decision.artifactHash,revision_key:decision.revisionKey,program_id:BUILDER_RESIDENCY_PROGRAM_ID,program_version:COS_UNIVERSITY_RESIDENCY_VERSION,standing:'resident',admission_evidence_hash:input.admissionEvidenceHash.toLowerCase(),gate_enforced:false,authority_expanded:false}
  const {data,error}=await input.db.from('cos_university_residency_enrollments').upsert(row,{onConflict:'artifact_row_id,program_id',ignoreDuplicates:true}).select('id,standing').maybeSingle()
  if(error) throw error
  if(!data?.id){
    const existing=await input.db.from('cos_university_residency_enrollments').select('id,standing').eq('artifact_row_id',input.admission.artifactRowId).eq('program_id',BUILDER_RESIDENCY_PROGRAM_ID).maybeSingle()
    if(existing.error) throw existing.error
    if(!existing.data?.id) throw new Error('residency_admission_persist_failed')
    return Object.freeze({ok:true as const,residencyId:String(existing.data.id),standing:String(existing.data.standing),created:false as const,decision})
  }
  return Object.freeze({ok:true as const,residencyId:String(data.id),standing:String(data.standing),created:true as const,decision})
}
