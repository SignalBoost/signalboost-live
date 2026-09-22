import type { HarnessLimits, HarnessRunRequest } from '../core/types.ts'

/**
 * Controlled execution environment for an external independent evaluator.
 * The Harness supplies runtime isolation only: it does not define exam material,
 * decide scores, graduate artifacts, or feed evaluation output back into training.
 */
export function createEvaluationRuntimeHarnessRequest(input:{runId:string;objective:string;tenantId:string;portableId:string;agentId:string;artifactId:string;artifactHash:string;artifactRevision?:string;environmentId:string;fixtureHash:string;capabilities:readonly string[];limits?:HarnessLimits}):HarnessRunRequest {
  return Object.freeze({
    runId:input.runId,
    objective:input.objective,
    identity:Object.freeze({agentId:input.agentId,role:'evaluation_candidate',tenantId:input.tenantId,portableId:input.portableId,artifact:Object.freeze({artifactId:input.artifactId,artifactHash:input.artifactHash,...(input.artifactRevision?{revision:input.artifactRevision}:{})})}),
    profile:'evaluation_runtime',
    environment:Object.freeze({environmentId:input.environmentId,class:'sandbox',fixtureHash:input.fixtureHash}),
    requestedCapabilities:Object.freeze([...input.capabilities]),
    requestedLimits:Object.freeze({maxToolCalls:500,deadlineMs:60*60_000,maxConcurrency:1,...(input.limits??{})}),
  })
}
