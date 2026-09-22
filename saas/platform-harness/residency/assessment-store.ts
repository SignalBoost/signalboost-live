import type { SupabaseClient } from '@supabase/supabase-js'
import { assessBuilderResidency } from '../../lib/ai/cos/cosUniversityResidency.ts'

/** Recompute educational standing only from durable accepted case evidence. */
export async function refreshBuilderResidencyAssessment(input:{db:SupabaseClient;residencyId:string;now?:()=>Date}){
  const evidence=await input.db.from('cos_university_residency_competency_evidence').select('competency_id,variant_hash,outcome,observed_at').eq('residency_id',input.residencyId).order('observed_at',{ascending:true})
  if(evidence.error) throw evidence.error
  const assessment=assessBuilderResidency((evidence.data??[]).map((row:any)=>({competencyId:String(row.competency_id??''),variantHash:String(row.variant_hash??''),outcome:row.outcome==='fail'?'fail':'pass',observedAt:String(row.observed_at??''),accepted:true})))
  const now=(input.now??(()=>new Date()))().toISOString()
  const update:any={standing:assessment.standing,updated_at:now}
  if(assessment.standing==='residency_complete') update.completed_at=now
  if(assessment.standing==='remediation_required') update.remediation_required_at=now
  const saved=await input.db.from('cos_university_residency_enrollments').update(update).eq('id',input.residencyId).select('id,standing,gate_enforced').maybeSingle()
  if(saved.error) throw saved.error
  if(!saved.data?.id) throw new Error('residency_assessment_persist_failed')
  return Object.freeze({ok:true as const,residencyId:String(saved.data.id),standing:assessment.standing,residencyComplete:assessment.residencyComplete,demonstratedCompetencies:assessment.demonstratedCompetencies,retainedCompetencies:assessment.retainedCompetencies,remediationCompetencies:assessment.remediationCompetencies,gateEnforced:saved.data.gate_enforced===true,promotionAuthorized:false as const,productionTrafficAuthorized:false as const,authorityExpanded:false as const})
}
