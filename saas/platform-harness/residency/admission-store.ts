import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BUILDER_RESIDENCY_PROGRAM_ID,
  COS_UNIVERSITY_RESIDENCY_VERSION,
  decideResidencyAdmission,
  type ResidencyAdmissionInput,
} from '../../lib/ai/cos/cosUniversityResidency.ts'

const AUTO_ADMISSION_ACTIVE_LIMIT = 4

function admissionEvidenceHash(input: ResidencyAdmissionInput): string {
  return createHash('sha256').update(JSON.stringify({
    profile: 'builder-residency-auto-admission-v1',
    programId: BUILDER_RESIDENCY_PROGRAM_ID,
    programVersion: COS_UNIVERSITY_RESIDENCY_VERSION,
    artifactRowId: input.artifactRowId,
    candidateId: input.candidateId,
    subjectId: input.subjectId,
    trainedArtifactId: input.trainedArtifactId,
    trainedArtifactHash: input.trainedArtifactHash.toLowerCase(),
    revisionKey: input.revisionKey.toLowerCase(),
    artifactStatus: input.artifactStatus,
    authorityExpanded: false,
  })).digest('hex')
}

export async function admitBuilderResidency(input:{
  db:SupabaseClient
  admission:ResidencyAdmissionInput
  admissionEvidenceHash:string
}){
  const decision=decideResidencyAdmission(input.admission)
  if(!decision.eligible) return Object.freeze({
    ok:false as const,
    reason:'residency_admission_rejected',
    blockers:decision.blockers,
  })
  if(!/^[a-f0-9]{64}$/i.test(input.admissionEvidenceHash)) return Object.freeze({
    ok:false as const,
    reason:'residency_admission_evidence_invalid',
    blockers:Object.freeze(['residency_admission_evidence_invalid']),
  })
  const row={
    artifact_row_id:input.admission.artifactRowId,
    candidate_id:input.admission.candidateId,
    subject_id:input.admission.subjectId,
    trained_artifact_id:input.admission.trainedArtifactId,
    trained_artifact_hash:decision.artifactHash,
    revision_key:decision.revisionKey,
    program_id:BUILDER_RESIDENCY_PROGRAM_ID,
    program_version:COS_UNIVERSITY_RESIDENCY_VERSION,
    standing:'resident',
    admission_evidence_hash:input.admissionEvidenceHash.toLowerCase(),
    gate_enforced:false,
    authority_expanded:false,
  }
  const {data,error}=await input.db
    .from('cos_university_residency_enrollments')
    .upsert(row,{onConflict:'artifact_row_id,program_id',ignoreDuplicates:true})
    .select('id,standing')
    .maybeSingle()
  if(error) throw error
  if(!data?.id){
    const existing=await input.db
      .from('cos_university_residency_enrollments')
      .select('id,standing')
      .eq('artifact_row_id',input.admission.artifactRowId)
      .eq('program_id',BUILDER_RESIDENCY_PROGRAM_ID)
      .maybeSingle()
    if(existing.error) throw existing.error
    if(!existing.data?.id) throw new Error('residency_admission_persist_failed')
    return Object.freeze({
      ok:true as const,
      residencyId:String(existing.data.id),
      standing:String(existing.data.standing),
      created:false as const,
      decision,
    })
  }
  return Object.freeze({
    ok:true as const,
    residencyId:String(data.id),
    standing:String(data.standing),
    created:true as const,
    decision,
  })
}

type AutoAdmissionArtifact = Readonly<{
  id:string
  candidate_id:string
  subject_id:string
  trained_artifact_id:string
  trained_artifact_hash:string
  revision_key:string
  status:string
  authority_expanded:boolean
}>

/**
 * Admit at most one trained Computer Science artifact per tick.
 *
 * The active-resident ceiling is throughput/backpressure only. Remediation-required enrollments\n * keep their durable remediation path but do not consume a teaching admission slot; otherwise a\n * failed cohort can permanently deadlock all later trained students. Admission never
 * grants final evaluation, promotion, Production traffic, or wider authority.
 */
export async function admitNextBuilderResidency(input:{
  db:SupabaseClient
  activeLimit?:number
}){
  const activeLimit=Math.max(1,Math.min(16,Math.trunc(input.activeLimit??AUTO_ADMISSION_ACTIVE_LIMIT)))

  const active=await input.db
    .from('cos_university_residency_enrollments')
    .select('id')
    .in('standing',['resident','senior_resident'])
    .limit(activeLimit)
  if(active.error) throw active.error
  if((active.data??[]).length>=activeLimit){
    return Object.freeze({
      ok:true as const,
      admitted:false as const,
      reason:'residency_active_capacity_full' as const,
      activeResidents:(active.data??[]).length,
      activeLimit,
      promotionAuthorized:false as const,
      productionTrafficAuthorized:false as const,
    })
  }

  const artifacts=await input.db
    .from('cos_local_distillation_artifacts')
    .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,status,authority_expanded')
    .eq('status','evaluation_pending')
    .eq('subject_id','Computer Science & Coding')
    .eq('authority_expanded',false)
    .like('candidate_id','mass:%')
    .order('created_at',{ascending:true})
    .limit(12)
  if(artifacts.error) throw artifacts.error

  for(const raw of artifacts.data??[]){
    const artifact=raw as AutoAdmissionArtifact
    const existing=await input.db
      .from('cos_university_residency_enrollments')
      .select('id')
      .eq('artifact_row_id',artifact.id)
      .eq('program_id',BUILDER_RESIDENCY_PROGRAM_ID)
      .maybeSingle()
    if(existing.error) throw existing.error
    if(existing.data?.id) continue

    const admission:ResidencyAdmissionInput={
      artifactRowId:String(artifact.id),
      candidateId:String(artifact.candidate_id),
      subjectId:String(artifact.subject_id),
      trainedArtifactId:String(artifact.trained_artifact_id),
      trainedArtifactHash:String(artifact.trained_artifact_hash),
      revisionKey:String(artifact.revision_key),
      artifactStatus:String(artifact.status),
      authorityExpanded:artifact.authority_expanded===true,
    }
    const decision=await admitBuilderResidency({
      db:input.db,
      admission,
      admissionEvidenceHash:admissionEvidenceHash(admission),
    })

    return Object.freeze({
      ...decision,
      admitted:decision.ok,
      activeResidents:(active.data??[]).length,
      activeLimit,
      promotionAuthorized:false as const,
      productionTrafficAuthorized:false as const,
    })
  }

  return Object.freeze({
    ok:true as const,
    admitted:false as const,
    reason:'no_unenrolled_builder_artifact' as const,
    activeResidents:(active.data??[]).length,
    activeLimit,
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
  })
}
