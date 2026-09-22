import type { HarnessManifest, HarnessRunResult, HarnessVerificationResult } from '../core/types.ts'
import { classifyHarnessResult } from '../core/failure-router.ts'
import { createTrajectoryJournal } from '../evidence/trajectory-journal.ts'
import type { GovernedHarnessExecutor, HarnessAction } from './governed-executor.ts'

export interface HarnessRunPlan { actions: readonly HarnessAction[] }
export interface HarnessOutcomeVerifier { verify(manifest: HarnessManifest): Promise<HarnessVerificationResult> }

export async function runHarness(input: { manifest: HarnessManifest; plan: HarnessRunPlan; executor: GovernedHarnessExecutor; verifier: HarnessOutcomeVerifier }): Promise<HarnessRunResult> {
  const { manifest } = input
  const journal = createTrajectoryJournal(manifest.runId)
  journal.append({kind:'run_started',summary:'Harness run started',evidenceRefs:[manifest.authorityManifestRef]})
  let productionMutationObserved = false
  for (const action of input.plan.actions) {
    const grant = manifest.capabilities.find(item => item.id === action.capabilityId)
    if (!grant) {
      journal.append({kind:'failure',summary:'Action capability is outside resolved manifest',data:{actionId:action.actionId,capabilityId:action.capabilityId}})
      return {runId:manifest.runId,profile:manifest.profile,trajectory:journal.snapshot(),outcome:{status:'authority_halt',failureCode:'capability_outside_manifest'},authorityExpanded:false,productionMutationObserved}
    }
    const result = await input.executor.execute(manifest, action)
    if (result.status === 'authority_boundary') {
      journal.append({kind:'escalation',summary:'Governed Socket halted action at authority boundary',data:{actionId:action.actionId,capabilityId:action.capabilityId}})
      return {runId:manifest.runId,profile:manifest.profile,trajectory:journal.snapshot(),outcome:{status:'authority_halt',failureCode:'governed_socket_authority_boundary'},authorityExpanded:false,productionMutationObserved}
    }
    if (result.status === 'execution_failed') {
      const status = classifyHarnessResult({gatewayOutcome:result.gatewayOutcome,error:result.error}).status
      journal.append({kind:'failure',summary:'Governed action execution failed',data:{actionId:action.actionId,capabilityId:action.capabilityId,status}})
      return {runId:manifest.runId,profile:manifest.profile,trajectory:journal.snapshot(),outcome:{status,failureCode:result.error ?? 'governed_action_failed'},authorityExpanded:false,productionMutationObserved}
    }
    if (manifest.environment.class === 'production' && grant.mutating) productionMutationObserved = true
    journal.append({kind:'tool_result',summary:'Governed action completed',data:{actionId:action.actionId,capabilityId:action.capabilityId}})
  }
  const verification = await input.verifier.verify(manifest)
  journal.append({kind:'verification',summary:verification.verified ? 'Outcome independently verified' : 'Outcome verification failed',evidenceRefs:verification.evidenceRefs,data:{verifierRef:verification.verifierRef}})
  const outcome = verification.verified ? {status:'success' as const,verifierRef:verification.verifierRef} : {status:'verification_failure' as const,verifierRef:verification.verifierRef,failureCode:verification.reason ?? 'verification_failed'}
  journal.append({kind:'run_finished',summary:verification.verified ? 'Harness run finished with verified success' : 'Harness run finished without verified success'})
  return {runId:manifest.runId,profile:manifest.profile,trajectory:journal.snapshot(),outcome,authorityExpanded:false,productionMutationObserved}
}
