import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_RESIDENCY_VERSION = 'cos-university-residency-v2-practical-education-harness' as const
export const COS_UNIVERSITY_RESIDENCY_ROLE = 'formal_practical_education' as const

export const RESIDENCY_LEVELS = ['student','candidate','resident','senior_resident','graduate_specialist','active_specialist'] as const
export type ResidencyLevel = (typeof RESIDENCY_LEVELS)[number]

export const RESIDENCY_COMPETENCY_STATES = ['unproven','supervised','demonstrated','retained','remediation_required'] as const
export type ResidencyCompetencyState = (typeof RESIDENCY_COMPETENCY_STATES)[number]

export type ResidencyPhase = 'practice' | 'remediation_replay'

export type ResidencyCaseResult = Readonly<{
  candidateId: string
  trainedArtifactHash: string
  subjectId: string
  caseFamily: string
  variantHash: string
  competencyId: string
  phase: ResidencyPhase
  state: ResidencyCompetencyState
  sandboxed: boolean
  exactArtifactVerified: boolean
  independentEvaluationPassed: boolean
  authorityExpanded: boolean
  productionMutationObserved: boolean
  toolTrajectoryEvidenceHash: string
}>

const HEX64=/^[a-f0-9]{64}$/i
const clean=(v:unknown,n=240)=>String(v??'').trim().slice(0,n)
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')

/**
 * Residency is the University's practical-education harness. It teaches through supervised cases
 * before independent final examination/graduation; it is not itself the independent evaluator.
 * It cannot promote an artifact or grant authority. Practice remains exact-artifact-bound, sandboxed,
 * and fail-closed on Production mutation or authority expansion.
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

  if(!candidateId) blockers.push('residency_candidate_id_missing')
  if(!subjectId) blockers.push('residency_subject_id_missing')
  if(!caseFamily) blockers.push('residency_case_family_missing')
  if(!competencyId) blockers.push('residency_competency_id_missing')
  if(!HEX64.test(artifact)) blockers.push('residency_artifact_hash_invalid')
  if(!HEX64.test(variant)) blockers.push('residency_variant_hash_invalid')
  if(!HEX64.test(trajectory)) blockers.push('residency_tool_trajectory_evidence_invalid')
  if(!input.sandboxed) blockers.push('residency_sandbox_required')
  if(!input.exactArtifactVerified) blockers.push('residency_exact_artifact_proof_required')
  // Independent final evaluation is deliberately downstream of teaching. This field records a
  // previously established exam result when replaying continuing education; it is never an
  // admission prerequisite for ordinary Residency practice.
  if(input.authorityExpanded) blockers.push('residency_authority_expansion_forbidden')
  if(input.productionMutationObserved) blockers.push('residency_production_mutation_forbidden')

  const accepted=blockers.length===0
  return Object.freeze({
    accepted,
    competencyState: accepted?input.state:'unproven' as ResidencyCompetencyState,
    evidenceHash: accepted?sha({profile:COS_UNIVERSITY_RESIDENCY_VERSION,candidateId,artifact,subjectId,caseFamily,variant,competencyId,phase:input.phase,state:input.state,trajectory,sandboxed:true,authorityExpanded:false,productionMutationObserved:false}):null,
    blockers:Object.freeze(blockers),
    educationRole:COS_UNIVERSITY_RESIDENCY_ROLE,
    independentFinalEvaluationRequired:true as const,
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
    authorityExpanded:false as const,
  })
}

export const BUILDER_RESIDENCY_V1_COMPETENCIES=Object.freeze([
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
