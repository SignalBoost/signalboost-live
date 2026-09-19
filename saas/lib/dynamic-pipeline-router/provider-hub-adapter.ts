// saas/lib/dynamic-pipeline-router/provider-hub-adapter.ts
// Adapter only: Provider Hub remains the source of provider/capability metadata.
import type { PortableCapabilityDescriptor } from '../../provider-hub-core/capability-runtime.ts'
import { createDynamicPipelineCandidate, type DynamicPipelineCandidate } from './core.ts'

function num(value: unknown, fallback: number): number {
  const n=Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function dynamicPipelineCandidatesFromProviderHub(
  capabilities: readonly PortableCapabilityDescriptor[],
): readonly DynamicPipelineCandidate[] {
  return Object.freeze(capabilities.map(capability=>{
    const metadata=capability.metadata ?? {}
    return createDynamicPipelineCandidate({
      pipelineId:`${capability.connectionId}:${capability.capabilityId}`,
      providerId:capability.providerId,
      capabilityIds:Object.freeze([capability.capabilityId]),
      availability:capability.availability,
      maxConcurrency:Math.max(1,Math.floor(num(metadata.maxConcurrency,1))),
      activeLeases:Math.max(0,Math.floor(num(metadata.activeLeases,0))),
      queueDepth:Math.max(0,Math.floor(num(metadata.queueDepth,0))),
      recentFailureRate:Math.max(0,Math.min(1,num(metadata.recentFailureRate,0))),
      estimatedUnitCostUsd:metadata.estimatedUnitCostUsd==null?null:num(metadata.estimatedUnitCostUsd,0),
      estimatedLatencyMs:metadata.estimatedLatencyMs==null?null:num(metadata.estimatedLatencyMs,0),
      environments:Object.freeze([capability.environmentId]),
      metadata:Object.freeze({
        tenantId:capability.tenantId,
        connectionId:capability.connectionId,
        requiresApproval:capability.requiresApproval,
        risk:capability.risk,
      }),
    })
  }))
}
