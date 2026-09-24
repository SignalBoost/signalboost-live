import type { HarnessManifest, HarnessRunResult } from '../core/types.ts'
import { createSelfHealingHandoff, type HarnessSelfHealingHandoff } from './self-healing.ts'
import { adaptResidencyRunToUniversity, type UniversityHarnessEvidenceDecision, type UniversityResidencyCaseContext } from './university.ts'

export type HarnessOutcomeRoute =
  | { destination:'durable_evidence'; result:HarnessRunResult }
  | { destination:'self_healing'; handoff:HarnessSelfHealingHandoff }
  | { destination:'university'; decision:UniversityHarnessEvidenceDecision }
  | { destination:'university_remediation'; runId:string; failureCode:string }
  | { destination:'referee_guardian'; runId:string; failureCode:string }
  | { destination:'harness_assurance'; runId:string; failureCode:string }

/** Route only already-classified outcomes. This function grants no repair, learning, or authority. */
export function routeCompletedHarnessRun(input:{manifest:HarnessManifest;result:HarnessRunResult;universityContext?:UniversityResidencyCaseContext}):HarnessOutcomeRoute {
  const {manifest,result}=input
  if(result.outcome.status==='success'){
    if(manifest.profile==='residency' && input.universityContext){
      return {destination:'university',decision:adaptResidencyRunToUniversity(manifest,result,input.universityContext)}
    }
    return {destination:'durable_evidence',result}
  }
  if(result.outcome.status==='infrastructure_failure'){
    const handoff=createSelfHealingHandoff(manifest,result)
    if(handoff) return {destination:'self_healing',handoff}
  }
  if(result.outcome.status==='agent_failure' && manifest.profile==='residency' && input.universityContext){
    return {destination:'university',decision:adaptResidencyRunToUniversity(manifest,result,input.universityContext)}
  }
  if(result.outcome.status==='agent_failure') {
    return {destination:'university_remediation',runId:result.runId,failureCode:result.outcome.failureCode??'harness_agent_failure'}
  }
  if(result.outcome.status==='authority_halt') return {destination:'referee_guardian',runId:result.runId,failureCode:result.outcome.failureCode??'harness_authority_halt'}
  return {destination:'harness_assurance',runId:result.runId,failureCode:result.outcome.failureCode??'harness_outcome_unresolved'}
}
