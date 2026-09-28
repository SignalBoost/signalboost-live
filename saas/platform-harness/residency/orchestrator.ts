import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  assessBuilderResidency,
  type ResidencyEvidenceForAssessment,
  type ResidencyStanding,
} from '../../lib/ai/cos/cosUniversityResidency.ts'
import {
  ACTIVE_BUILDER_RESIDENCY_CASES,
  builderResidencyCaseByVariantHash,
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

export interface UnrecoverableResidencyCompetency {
  competencyId:string
  passesAfterLastFailure:number
  untriedVariants:number
  attempts:readonly Readonly<{variantId:string;variantHash:string;outcome:'pass'|'fail';observedAt:string}>[]
}

export interface BuilderResidencyOrchestratorStore extends BuilderResidencyEvidenceStore {
  nextEnrollment():Promise<BuilderResidencyEnrollment|null>
  /**
   * Terminal FAIL for a resident that can no longer clear a remediation competency. Optional so stores
   * without it keep the previous behaviour (`waiting_for_residency_cases`).
   */
  closeFailedResidency?(input:{
    enrollment:BuilderResidencyEnrollment
    competencies:readonly UnrecoverableResidencyCompetency[]
  }):Promise<{closed:boolean;artifactQuarantined:boolean}>
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

/**
 * Remediation competencies that can no longer be cleared.
 *
 * After a failure a competency needs two DISTINCT later passes, and each variant can be attempted once
 * (competency evidence is unique per residency, competency and variant). When the later passes already
 * recorded plus the variants still untried add up to fewer than two, no future case can clear it: the
 * Residency evaluation has reached its result and the requirement was not met. Production 2026-09-28:
 * 26 of 37 active residents were here (almost all root_cause_diagnosis fail -> pass -> fail on its three
 * variants), stayed `remediation_required` forever and kept taking practical-case turns from residents
 * that can still finish. The standard is unchanged; only a result that is already certain is recorded.
 */
export function unrecoverableBuilderResidencyCompetencies(input:{
  evidence:readonly ResidencyEvidenceForAssessment[]
  cases?:readonly BuilderResidencyCase[]
}):readonly UnrecoverableResidencyCompetency[]{
  const cases=input.cases??ACTIVE_BUILDER_RESIDENCY_CASES
  const assessment=assessBuilderResidency(input.evidence)
  const recorded=recordedVariantKeys(input.evidence)
  const unrecoverable:UnrecoverableResidencyCompetency[]=[]
  for(const competency of assessment.competencies){
    if(competency.state!=='remediation_required') continue
    const untriedVariants=cases.filter(item=>
      item.competencyId===competency.competencyId&&!recorded.has(`${item.competencyId}:${item.variantHash}`),
    ).length
    if(competency.distinctPasses+untriedVariants>=2) continue
    const attempts=input.evidence
      .filter(item=>item.accepted&&item.competencyId===competency.competencyId)
      .map(item=>Object.freeze({
        variantId:builderResidencyCaseByVariantHash(item.variantHash)?.variantId??'unknown',
        variantHash:item.variantHash,
        outcome:item.outcome,
        observedAt:item.observedAt,
      }))
      .sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt))
    unrecoverable.push(Object.freeze({
      competencyId:competency.competencyId,
      passesAfterLastFailure:competency.distinctPasses,
      untriedVariants,
      attempts:Object.freeze(attempts),
    }))
  }
  return Object.freeze(unrecoverable)
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

  // A resident that can no longer clear a remediation competency gets its final result instead of another
  // practical case that cannot change it.
  const unrecoverable=unrecoverableBuilderResidencyCompetencies({evidence:beforeEvidence})
  if(unrecoverable.length&&input.store.closeFailedResidency){
    try{
      const closure=await input.store.closeFailedResidency({enrollment,competencies:unrecoverable})
      return Object.freeze({
        ok:true,
        state:'residency_failed' as const,
        residencyId:enrollment.residencyId,
        assessment:before,
        unrecoverableCompetencies:unrecoverable,
        closed:closure.closed,
        artifactQuarantined:closure.artifactQuarantined,
        coverage,
        automaticFinalGateEnable:false as const,
        promotionAuthorized:false as const,
        productionTrafficAuthorized:false as const,
      })
    }catch(error){
      return Object.freeze({
        ok:false,
        state:'residency_failure_not_recorded' as const,
        residencyId:enrollment.residencyId,
        assessment:before,
        unrecoverableCompetencies:unrecoverable,
        error:error instanceof Error?error.message:String(error),
        coverage,
        automaticFinalGateEnable:false as const,
        promotionAuthorized:false as const,
        productionTrafficAuthorized:false as const,
      })
    }
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
