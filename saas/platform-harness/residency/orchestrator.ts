import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  assessBuilderResidency,
  type ResidencyEvidenceForAssessment,
  type ResidencyStanding,
} from '../../lib/ai/cos/cosUniversityResidency.ts'
import {
  ACTIVE_BUILDER_RESIDENCY_CASES,
  type BuilderResidencyCase,
} from '../cases/builder-residency.ts'
import type {
  BuilderResidencyEvidenceStore,
  BuilderResidencyExactArtifactExecutor,
} from './builder-case-runner.ts'
import { runBuilderResidencyCase } from './builder-case-runner.ts'
import type { HarnessAuthorityEnvelope } from '../core/types.ts'
import type { HarnessEvidenceSink } from '../evidence/durable-evidence.ts'

export interface BuilderResidencyEnrollment {
  residencyId:string
  candidateId:string
  subjectId:string
  tenantId:string
  portableId:string
  agentId:string
  artifactId:string
  artifactHash:string
  artifactRevision?:string
  sandboxEnvironmentId:string
  standing:ResidencyStanding
}

export interface BuilderResidencyOrchestratorStore extends BuilderResidencyEvidenceStore {
  nextEnrollment():Promise<BuilderResidencyEnrollment|null>
  readEvidence(residencyId:string):Promise<readonly ResidencyEvidenceForAssessment[]>
  refreshAssessment(residencyId:string):Promise<{
    standing:ResidencyStanding
    residencyComplete:boolean
    demonstratedCompetencies:number
    retainedCompetencies:number
    remediationCompetencies:readonly string[]
  }>
}

export interface BuilderResidencyCoverage {
  totalCompetencies:number
  coveredCompetencies:number
  missingCompetencies:readonly string[]
}

export function assessBuilderResidencyCaseCoverage(
  cases:readonly BuilderResidencyCase[]=ACTIVE_BUILDER_RESIDENCY_CASES,
):BuilderResidencyCoverage{
  const covered=new Set(cases.map(item=>item.competencyId))
  const missing=BUILDER_RESIDENCY_V1_COMPETENCIES.filter(item=>!covered.has(item))
  return Object.freeze({
    totalCompetencies:BUILDER_RESIDENCY_V1_COMPETENCIES.length,
    coveredCompetencies:covered.size,
    missingCompetencies:Object.freeze([...missing]),
  })
}

function passedVariantKeys(evidence:readonly ResidencyEvidenceForAssessment[]):Set<string>{
  return new Set(
    evidence
      .filter(item=>item.accepted&&item.outcome==='pass')
      .map(item=>`${item.competencyId}:${item.variantHash}`),
  )
}

/**
 * Variants this resident already has durable competency evidence for, pass OR fail.
 *
 * `cos_university_residency_competency_evidence` is unique on (residency_id, competency_id,
 * variant_hash) by design: one variant yields one educational observation. Re-running a variant
 * that already has evidence can never record a second result; remediation therefore requires a
 * DIFFERENT variant, never a replay of the failed one.
 */
function recordedVariantKeys(evidence:readonly ResidencyEvidenceForAssessment[]):Set<string>{
  return new Set(
    evidence.map(item=>`${item.competencyId}:${item.variantHash}`),
  )
}

export function selectNextBuilderResidencyCase(input:{
  evidence:readonly ResidencyEvidenceForAssessment[]
  cases?:readonly BuilderResidencyCase[]
}):BuilderResidencyCase|null{
  const cases=input.cases??ACTIVE_BUILDER_RESIDENCY_CASES
  const assessment=assessBuilderResidency(input.evidence)
  const recorded=recordedVariantKeys(input.evidence)
  const available=cases.filter(item=>
    !recorded.has(`${item.competencyId}:${item.variantHash}`),
  )

  const remediation=new Set(assessment.remediationCompetencies)
  const remediationCase=available.find(item=>remediation.has(item.competencyId))
  if(remediationCase) return remediationCase

  const stateByCompetency=new Map(
    assessment.competencies.map(item=>[item.competencyId,item.state]),
  )
  return available.find(item=>
    !['demonstrated','retained'].includes(String(stateByCompetency.get(item.competencyId))),
  )??null
}

export async function runBuilderResidencyOrchestrator(input:{
  store:BuilderResidencyOrchestratorStore
  executor:BuilderResidencyExactArtifactExecutor
  harnessEvidenceSink:HarnessEvidenceSink
  authorityFor(enrollment:BuilderResidencyEnrollment):Promise<HarnessAuthorityEnvelope>
  requestedCapabilities?:readonly string[]
  repairInfrastructure?:(input:{
    runId:string
    candidateId:string
    artifactHash:string
    failureCode:string
  })=>Promise<unknown>
  now?:()=>Date
}){
  const enrollment=await input.store.nextEnrollment()
  const coverage=assessBuilderResidencyCaseCoverage()

  if(!enrollment){
    return Object.freeze({
      ok:true,
      state:'idle' as const,
      coverage,
      automaticFinalGateEnable:false as const,
      promotionAuthorized:false as const,
      productionTrafficAuthorized:false as const,
    })
  }

  const beforeEvidence=await input.store.readEvidence(enrollment.residencyId)
  const before=assessBuilderResidency(beforeEvidence)

  if(before.residencyComplete){
    await input.store.refreshAssessment(enrollment.residencyId)
    return Object.freeze({
      ok:true,
      state:'already_complete' as const,
      residencyId:enrollment.residencyId,
      assessment:before,
      coverage,
      automaticFinalGateEnable:false as const,
      promotionAuthorized:false as const,
      productionTrafficAuthorized:false as const,
    })
  }

  const practiceCase=selectNextBuilderResidencyCase({evidence:beforeEvidence})
  if(!practiceCase){
    await input.store.refreshAssessment(enrollment.residencyId)
    return Object.freeze({
      ok:false,
      state:'waiting_for_residency_cases' as const,
      residencyId:enrollment.residencyId,
      assessment:before,
      coverage,
      automaticFinalGateEnable:false as const,
      promotionAuthorized:false as const,
      productionTrafficAuthorized:false as const,
    })
  }

  const authority=await input.authorityFor(enrollment)
  const execution=await runBuilderResidencyCase({
    residencyId:enrollment.residencyId,
    candidateId:enrollment.candidateId,
    subjectId:enrollment.subjectId,
    tenantId:enrollment.tenantId,
    portableId:enrollment.portableId,
    agentId:enrollment.agentId,
    artifactId:enrollment.artifactId,
    artifactHash:enrollment.artifactHash,
    artifactRevision:enrollment.artifactRevision,
    sandboxEnvironmentId:enrollment.sandboxEnvironmentId,
    authority,
    practiceCase,
    requestedCapabilities:input.requestedCapabilities,
    executor:input.executor,
    harnessEvidenceSink:input.harnessEvidenceSink,
    store:input.store,
    now:input.now,
  })

  let selfHealing:unknown=null
  if(!execution.ok&&input.repairInfrastructure){
    const executionObject=execution as {
      result?:{
        runId?:string
        outcome?:{status?:string;failureCode?:string}
      }
    }
    const result=executionObject.result
    const failureCode=String(result?.outcome?.failureCode??'').trim()
    if(result?.outcome?.status==='infrastructure_failure'&&failureCode){
      try{
        selfHealing=await input.repairInfrastructure({
          runId:String(result.runId||'').trim()||`residency:${enrollment.residencyId}`,
          candidateId:enrollment.candidateId,
          artifactHash:enrollment.artifactHash,
          failureCode,
        })
      }catch(error){
        selfHealing=Object.freeze({
          attempted:true,
          completed:false,
          failureCode,
          message:error instanceof Error?error.message:'residency_self_healing_actuation_failed',
          authorityExpanded:false,
          productionTrafficAuthorized:false,
        })
      }
    }
  }

  const afterEvidence=await input.store.readEvidence(enrollment.residencyId)
  const after=assessBuilderResidency(afterEvidence)
  await input.store.refreshAssessment(enrollment.residencyId)

  return Object.freeze({
    ok:execution.ok,
    state:execution.ok?'case_completed' as const:'case_not_completed' as const,
    residencyId:enrollment.residencyId,
    practiceCase:Object.freeze({
      caseFamily:practiceCase.caseFamily,
      competencyId:practiceCase.competencyId,
      variantHash:practiceCase.variantHash,
    }),
    execution,
    ...(selfHealing?{selfHealing}:{}),
    assessment:after,
    coverage,
    automaticFinalGateEnable:false as const,
    promotionAuthorized:false as const,
    productionTrafficAuthorized:false as const,
  })
}
