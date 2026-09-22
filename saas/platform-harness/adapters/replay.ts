import type { HarnessLimits, HarnessRunRequest } from '../core/types.ts'

/** Build a non-mutating replay request from observable evidence only. */
export function createReplayHarnessRequest(input:{runId:string;objective:string;tenantId:string;portableId:string;agentId:string;artifactId?:string;artifactHash?:string;environmentId:string;fixtureHash:string;capabilities:readonly string[];limits?:HarnessLimits}):HarnessRunRequest {
  return Object.freeze({
    runId:input.runId,
    objective:input.objective,
    identity:Object.freeze({agentId:input.agentId,role:'replay',tenantId:input.tenantId,portableId:input.portableId,...(input.artifactId?{artifact:Object.freeze({artifactId:input.artifactId,...(input.artifactHash?{artifactHash:input.artifactHash}:{})})}:{})}),
    profile:'replay',
    environment:Object.freeze({environmentId:input.environmentId,class:'sandbox',fixtureHash:input.fixtureHash}),
    requestedCapabilities:Object.freeze([...input.capabilities]),
    requestedLimits:Object.freeze({maxToolCalls:100,deadlineMs:15*60_000,maxConcurrency:1,...(input.limits??{})}),
  })
}
