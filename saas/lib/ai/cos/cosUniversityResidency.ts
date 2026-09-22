import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_RESIDENCY_VERSION = 'cos-university-residency-v2' as const
export const BUILDER_RESIDENCY_PROGRAM_ID = 'builder-computer-science-v1' as const
export const BUILDER_RESIDENCY_RETENTION_MS = 24 * 60 * 60 * 1000

export const RESIDENCY_LEVELS = ['student','candidate','resident','senior_resident','graduate_specialist','active_specialist'] as const
export type ResidencyLevel = (typeof RESIDENCY_LEVELS)[number]

export const RESIDENCY_COMPETENCY_STATES = ['unproven','supervised','demonstrated','retained','remediation_required'] as const
export type ResidencyCompetencyState = (typeof RESIDENCY_COMPETENCY_STATES)[number]

export const RESIDENCY_STANDINGS = ['resident','senior_resident','residency_complete','remediation_required'] as const
export type ResidencyStanding = (typeof RESIDENCY_STANDINGS)[number]

export const BUILDER_RESIDENCY_V1_COMPETENCIES = Object.freeze([
  'repository_navigation',
  'root_cause_diagnosis',
  'typescript_nextjs_repair',
  'vercel_deployment_recovery',
  'supabase_diagnosis',
  'playwright_browser_verification',
  'chrome_devtools_evidence',
  'test_and_regression_construction',
  'rollback_judgment',
  'mcp_tool_selection_and_recovery',
  'security_and_authority_compliance',
  'recovery_from_wrong_initial_diagnosis',
  'cross_specialist_escalation',
] as const)
export type BuilderResidencyCompetency = (typeof BUILDER_RESIDENCY_V1_COMPETENCIES)[number]

const HEX64=/^[a-f0-9]{64}$/i
const clean=(v:unknown,n=240)=>String(v??'').trim().slice(0,n)
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')

export function isBuilderResidencySubject(value:unknown):boolean{
  const normalized=clean(value,160).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
  return normalized==='computer_science'||normalized==='computer_science_coding'
}

export type ResidencyAdmissionInput=Readonly<{
  artifactRowId:string
  candidateId:string
  subjectId:string
  trainedArtifactId:string
  trainedArtifactHash:string
  revisionKey:string
  artifactStatus:string
  authorityExpanded:boolean
}>

/**
 * Residency is part of formal education. Admission therefore starts from a trained immutable student
 * artifact, before the final canary and independent final examination. evaluation_pending is the
 * current artifact-ledger state that proves training + rollback registration are durable.
 */
export function decideResidencyAdmission(input:ResidencyAdmissionInput){
  const blockers:string[]=[]
  const artifactHash=clean(input.trainedArtifactHash,64).toLowerCase()
  const revisionKey=clean(input.revisionKey,64).toLowerCase()

  if(!clean(input.artifactRowId,120)) blockers.push('residency_artifact_row_missing')
  if(!clean(input.candidateId)) blockers.push('residency_candidate_id_missing')
  if(!clean(input.subjectId,160)) blockers.push('residency_subject_id_missing')
  if(!clean(input.trainedArtifactId,500)) blockers.push('residency_trained_artifact_missing')
  if(!HEX64.test(artifactHash)) blockers.push('residency_artifact_hash_invalid')
  if(!HEX64.test(revisionKey)) blockers.push('residency_revision_key_invalid')
  if(input.artifactStatus!=='evaluation_pending') blockers.push('residency_trained_artifact_not_ready')
  if(input.authorityExpanded) blockers.push('residency_authority_expansion_forbidden')

  return Object.freeze({
    eligible:blockers.length===0,
    artifactHash,
    revisionKey,
    formalEducationStage:'practical_residency' as const,
    blockers:Object.freeze(blockers),
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
    authorityExpanded:false as const,
  })
}

export type ResidencyCaseResult=Readonly<{
  candidateId:string
  trainedArtifactHash:string
  subjectId:string
  caseFamily:string
  variantHash:string
  competencyId:string
  outcome:'pass'|'fail'
  observedAt:string
  sandboxed:boolean
  supervised:boolean
  exactArtifactBound:boolean
  finalExamMaterialUsed:boolean
  authorityExpanded:boolean
  productionMutationObserved:boolean
  toolTrajectoryEvidenceHash:string
}>

/**
 * A Residency case is supervised practice, not a final exam. The host proves exact artifact binding
 * inside the sandbox, but no post-Residency canary or independent final-exam pass is required for
 * practice evidence. Hidden final-exam material is explicitly forbidden from the teaching harness.
 */
export function decideResidencyEvidence(input:ResidencyCaseResult){
  const blockers:string[]=[]
  const candidateId=clean(input.candidateId)
  const subjectId=clean(input.subjectId,160)
  const caseFamily=clean(input.caseFamily,160)
  const competencyId=clean(input.competencyId,160)
  const artifact=clean(input.trainedArtifactHash,64).toLowerCase()
  const variant=clean(input.variantHash,64).toLowerCase()
  const trajectory=clean(input.toolTrajectoryEvidenceHash,64).toLowerCase()
  const observedAt=clean(input.observedAt,80)
  const observedMs=Date.parse(observedAt)

  if(!candidateId) blockers.push('residency_candidate_id_missing')
  if(!subjectId) blockers.push('residency_subject_id_missing')
  if(!caseFamily) blockers.push('residency_case_family_missing')
  if(!competencyId) blockers.push('residency_competency_id_missing')
  if(!HEX64.test(artifact)) blockers.push('residency_artifact_hash_invalid')
  if(!HEX64.test(variant)) blockers.push('residency_variant_hash_invalid')
  if(!HEX64.test(trajectory)) blockers.push('residency_tool_trajectory_evidence_invalid')
  if(!Number.isFinite(observedMs)) blockers.push('residency_observed_at_invalid')
  if(!input.sandboxed) blockers.push('residency_sandbox_required')
  if(!input.supervised) blockers.push('residency_supervision_required')
  if(!input.exactArtifactBound) blockers.push('residency_exact_artifact_binding_required')
  if(input.finalExamMaterialUsed) blockers.push('residency_final_exam_material_forbidden')
  if(input.authorityExpanded) blockers.push('residency_authority_expansion_forbidden')
  if(input.productionMutationObserved) blockers.push('residency_production_mutation_forbidden')

  const accepted=blockers.length===0
  return Object.freeze({
    accepted,
    outcome:input.outcome,
    evidenceHash:accepted?sha({
      profile:COS_UNIVERSITY_RESIDENCY_VERSION,
      candidateId,artifact,subjectId,caseFamily,variant,competencyId,
      outcome:input.outcome,observedAt,trajectory,
      sandboxed:true,supervised:true,exactArtifactBound:true,
      finalExamMaterialUsed:false,authorityExpanded:false,productionMutationObserved:false,
    }):null,
    blockers:Object.freeze(blockers),
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
    authorityExpanded:false as const,
  })
}

export type ResidencyEvidenceForAssessment=Readonly<{
  competencyId:string
  variantHash:string
  outcome:'pass'|'fail'
  observedAt:string
  accepted:boolean
}>

export function assessResidencyCompetency(
  competencyId:string,
  evidence:readonly ResidencyEvidenceForAssessment[],
):Readonly<{state:ResidencyCompetencyState;distinctPasses:number;evidenceCount:number}>{
  const rows=evidence
    .filter(row=>row.accepted&&clean(row.competencyId,160)===competencyId&&HEX64.test(clean(row.variantHash,64)))
    .map(row=>({...row,observedMs:Date.parse(clean(row.observedAt,80))}))
    .filter(row=>Number.isFinite(row.observedMs))
    .sort((a,b)=>a.observedMs-b.observedMs)

  if(!rows.length) return Object.freeze({state:'unproven',distinctPasses:0,evidenceCount:0})

  let lastFailure=-1
  for(const row of rows) if(row.outcome==='fail') lastFailure=Math.max(lastFailure,row.observedMs)
  const passes=rows.filter(row=>row.outcome==='pass'&&row.observedMs>lastFailure)
  const distinct=[...new Map(passes.map(row=>[clean(row.variantHash,64).toLowerCase(),row])).values()]

  if(lastFailure>=0&&distinct.length<2){
    return Object.freeze({state:'remediation_required',distinctPasses:distinct.length,evidenceCount:rows.length})
  }
  if(distinct.length===0) return Object.freeze({state:'unproven',distinctPasses:0,evidenceCount:rows.length})
  if(distinct.length===1) return Object.freeze({state:'supervised',distinctPasses:1,evidenceCount:rows.length})

  const retained=distinct.length>=3&&(distinct[distinct.length-1].observedMs-distinct[0].observedMs)>=BUILDER_RESIDENCY_RETENTION_MS
  return Object.freeze({
    state:retained?'retained':'demonstrated',
    distinctPasses:distinct.length,
    evidenceCount:rows.length,
  })
}

export function assessBuilderResidency(evidence:readonly ResidencyEvidenceForAssessment[]){
  const competencies=BUILDER_RESIDENCY_V1_COMPETENCIES.map(competencyId=>({
    competencyId,
    ...assessResidencyCompetency(competencyId,evidence),
  }))
  const remediation=competencies.filter(row=>row.state==='remediation_required')
  const demonstrated=competencies.filter(row=>row.state==='demonstrated'||row.state==='retained').length
  const retained=competencies.filter(row=>row.state==='retained').length
  const complete=demonstrated===BUILDER_RESIDENCY_V1_COMPETENCIES.length
  const standing:ResidencyStanding=remediation.length>0?'remediation_required'
    :complete?'residency_complete'
      :demonstrated>=Math.ceil(BUILDER_RESIDENCY_V1_COMPETENCIES.length/2)?'senior_resident'
        :'resident'

  return Object.freeze({
    profile:COS_UNIVERSITY_RESIDENCY_VERSION,
    programId:BUILDER_RESIDENCY_PROGRAM_ID,
    formalEducationStage:'practical_residency' as const,
    standing,
    residencyComplete:complete&&remediation.length===0,
    demonstratedCompetencies:demonstrated,
    retainedCompetencies:retained,
    remediationCompetencies:Object.freeze(remediation.map(row=>row.competencyId)),
    competencies:Object.freeze(competencies),
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
    authorityExpanded:false as const,
  })
}

/** Shadow-safe transition: enforce only after the practical runner is operational. */
export function finalEvaluationResidencyGate(input:{
  subjectId:unknown
  gateEnforced:boolean
  residencyComplete:boolean
}){
  const programRequired=isBuilderResidencySubject(input.subjectId)
  const enforced=programRequired&&input.gateEnforced===true
  return Object.freeze({
    programRequired,
    enforced,
    allowed:!enforced||input.residencyComplete===true,
    reason:!enforced||input.residencyComplete===true?null:'formal_residency_not_complete',
  })
}
