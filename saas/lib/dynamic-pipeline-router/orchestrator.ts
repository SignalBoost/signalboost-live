// saas/lib/dynamic-pipeline-router/orchestrator.ts
import {
  DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION,
  rankDynamicPipelineCandidates,
  type DynamicPipelineCandidate,
  type DynamicPipelineWorkload,
} from './core.ts'

export interface DynamicPipelineLease {
  readonly leaseId: string
  readonly workloadId: string
  readonly pipelineId: string
  readonly fencingToken?: number
  readonly expiresAt?: string
}

export interface DynamicPipelineLeasePort {
  tryAcquire(input: {
    workloadId: string
    pipelineId: string
    providerId: string
    leaseDurationMs: number
  }): Promise<DynamicPipelineLease | null>
  release?(lease: DynamicPipelineLease): Promise<void>
}

export async function claimAvailableDynamicPipeline(input: {
  workload: DynamicPipelineWorkload
  candidates: readonly DynamicPipelineCandidate[]
  leasePort: DynamicPipelineLeasePort
  leaseDurationMs?: number
}) {
  const leaseDurationMs=Math.max(1_000,Math.min(3_600_000,Math.floor(input.leaseDurationMs ?? 60_000)))
  const ranked=rankDynamicPipelineCandidates(input.workload,input.candidates)
  const attempted: string[]=[]
  for(const item of ranked){
    attempted.push(item.candidate.pipelineId)
    const lease=await input.leasePort.tryAcquire({
      workloadId:input.workload.workloadId,
      pipelineId:item.candidate.pipelineId,
      providerId:item.candidate.providerId,
      leaseDurationMs,
    })
    if(lease) return Object.freeze({
      schemaVersion:DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION,
      claimed:true as const,
      workloadId:input.workload.workloadId,
      candidate:item.candidate,
      lease:Object.freeze({...lease}),
      attemptedPipelineIds:Object.freeze(attempted),
      authorityExpanded:false as const,
    })
  }
  return Object.freeze({
    schemaVersion:DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION,
    claimed:false as const,
    workloadId:input.workload.workloadId,
    candidate:null,
    lease:null,
    attemptedPipelineIds:Object.freeze(attempted),
    reason:ranked.length?'capacity_claim_conflict':'no_compatible_pipeline',
    authorityExpanded:false as const,
  })
}
