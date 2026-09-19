// saas/lib/dynamic-pipeline-router/core.ts
// Host-neutral, provider-neutral workload routing. This module does not own provider registration,
// credentials, durable queues, approvals, or execution. It selects compatible available capacity.

export const DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION = 'dynamic-pipeline-router-v1' as const

export type PipelineAvailability = 'available' | 'degraded' | 'unavailable'

export interface DynamicPipelineCandidate {
  readonly pipelineId: string
  readonly providerId: string
  readonly capabilityIds: readonly string[]
  readonly availability: PipelineAvailability
  readonly maxConcurrency: number
  readonly activeLeases: number
  readonly queueDepth: number
  readonly recentFailureRate: number
  readonly estimatedUnitCostUsd?: number | null
  readonly estimatedLatencyMs?: number | null
  readonly environments?: readonly string[]
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface DynamicPipelineWorkload {
  readonly workloadId: string
  readonly capabilityId: string
  readonly environment?: string
  readonly allowedProviderIds?: readonly string[]
  readonly preferredProviderIds?: readonly string[]
  readonly excludedProviderIds?: readonly string[]
  readonly excludedPipelineIds?: readonly string[]
  readonly allowDegraded?: boolean
  readonly maxEstimatedUnitCostUsd?: number
  readonly maxEstimatedLatencyMs?: number
}

export interface RankedDynamicPipeline {
  readonly candidate: DynamicPipelineCandidate
  readonly preferenceRank: number
  readonly remainingCapacity: number
  readonly loadRatio: number
  readonly deterministicTieBreak: number
}

export interface DynamicPipelineRouteDecision {
  readonly schemaVersion: typeof DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION
  readonly workloadId: string
  readonly capabilityId: string
  readonly selected: DynamicPipelineCandidate | null
  readonly alternatives: readonly DynamicPipelineCandidate[]
  readonly reason: 'selected' | 'no_compatible_pipeline'
  readonly authorityExpanded: false
}

const SECRET_KEY = /(secret|token|cookie|password|authorization|api[_-]?key|credential)/i

function required(value: unknown, field: string): string {
  const normalized=String(value ?? '').trim()
  if(!normalized) throw new Error(`dynamic_pipeline_router_${field}_required`)
  return normalized
}

function finite(value: unknown, fallback: number): number {
  const n=Number(value)
  return Number.isFinite(n) ? n : fallback
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finite(value, fallback)))
}

function unique(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...new Set((values ?? []).map(v=>required(v,'value')))])
}

function tieBreak(workloadId: string, pipelineId: string): number {
  const s=`${workloadId}\u0000${pipelineId}`
  let h=2166136261
  for(let i=0;i<s.length;i+=1){ h^=s.charCodeAt(i); h=Math.imul(h,16777619) }
  return h>>>0
}

function preferenceRank(providerId: string, preferred: readonly string[] | undefined): number {
  if(!preferred?.length) return Number.MAX_SAFE_INTEGER
  const i=preferred.indexOf(providerId)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

export function createDynamicPipelineCandidate(input: DynamicPipelineCandidate): DynamicPipelineCandidate {
  const metadata=input.metadata ? Object.freeze({...input.metadata}) : undefined
  if(metadata && Object.keys(metadata).some(key=>SECRET_KEY.test(key))) throw new Error('dynamic_pipeline_router_secret_metadata_rejected')
  const maxConcurrency=Math.floor(bounded(input.maxConcurrency,1,1,100000))
  const activeLeases=Math.floor(bounded(input.activeLeases,0,0,maxConcurrency))
  const queueDepth=Math.floor(bounded(input.queueDepth,0,0,1000000))
  const recentFailureRate=bounded(input.recentFailureRate,0,0,1)
  const estimatedUnitCostUsd=input.estimatedUnitCostUsd == null ? null : bounded(input.estimatedUnitCostUsd,0,0,1_000_000)
  const estimatedLatencyMs=input.estimatedLatencyMs == null ? null : bounded(input.estimatedLatencyMs,0,0,86_400_000)
  if(!['available','degraded','unavailable'].includes(input.availability)) throw new Error('dynamic_pipeline_router_availability_invalid')
  return Object.freeze({
    pipelineId: required(input.pipelineId,'pipeline_id'),
    providerId: required(input.providerId,'provider_id'),
    capabilityIds: unique(input.capabilityIds),
    availability: input.availability,
    maxConcurrency,
    activeLeases,
    queueDepth,
    recentFailureRate,
    estimatedUnitCostUsd,
    estimatedLatencyMs,
    environments: input.environments ? unique(input.environments) : undefined,
    metadata,
  })
}

function compatible(request: DynamicPipelineWorkload, candidate: DynamicPipelineCandidate): boolean {
  if(candidate.availability==='unavailable') return false
  if(candidate.availability==='degraded' && request.allowDegraded!==true) return false
  if(!candidate.capabilityIds.includes(request.capabilityId)) return false
  if(candidate.activeLeases>=candidate.maxConcurrency) return false
  if(request.environment && candidate.environments?.length && !candidate.environments.includes(request.environment)) return false
  if(request.allowedProviderIds?.length && !request.allowedProviderIds.includes(candidate.providerId)) return false
  if(request.excludedProviderIds?.includes(candidate.providerId)) return false
  if(request.excludedPipelineIds?.includes(candidate.pipelineId)) return false
  if(request.maxEstimatedUnitCostUsd != null && candidate.estimatedUnitCostUsd != null && candidate.estimatedUnitCostUsd>request.maxEstimatedUnitCostUsd) return false
  if(request.maxEstimatedLatencyMs != null && candidate.estimatedLatencyMs != null && candidate.estimatedLatencyMs>request.maxEstimatedLatencyMs) return false
  return true
}

export function rankDynamicPipelineCandidates(
  request: DynamicPipelineWorkload,
  candidates: readonly DynamicPipelineCandidate[],
): readonly RankedDynamicPipeline[] {
  const workloadId=required(request.workloadId,'workload_id')
  const capabilityId=required(request.capabilityId,'capability_id')
  const normalized={...request,workloadId,capabilityId}
  return Object.freeze(candidates
    .map(createDynamicPipelineCandidate)
    .filter(candidate=>compatible(normalized,candidate))
    .map(candidate=>Object.freeze({
      candidate,
      preferenceRank: preferenceRank(candidate.providerId, request.preferredProviderIds),
      remainingCapacity: candidate.maxConcurrency-candidate.activeLeases,
      loadRatio: candidate.activeLeases/candidate.maxConcurrency,
      deterministicTieBreak: tieBreak(workloadId,candidate.pipelineId),
    }))
    .sort((a,b)=>
      (a.candidate.availability==='available'?0:1)-(b.candidate.availability==='available'?0:1)
      || a.preferenceRank-b.preferenceRank
      || a.candidate.recentFailureRate-b.candidate.recentFailureRate
      || a.loadRatio-b.loadRatio
      || a.candidate.queueDepth-b.candidate.queueDepth
      || finite(a.candidate.estimatedUnitCostUsd,Number.MAX_SAFE_INTEGER)-finite(b.candidate.estimatedUnitCostUsd,Number.MAX_SAFE_INTEGER)
      || finite(a.candidate.estimatedLatencyMs,Number.MAX_SAFE_INTEGER)-finite(b.candidate.estimatedLatencyMs,Number.MAX_SAFE_INTEGER)
      || a.deterministicTieBreak-b.deterministicTieBreak
      || a.candidate.pipelineId.localeCompare(b.candidate.pipelineId)
    ))
}

export function routeDynamicPipeline(
  request: DynamicPipelineWorkload,
  candidates: readonly DynamicPipelineCandidate[],
): DynamicPipelineRouteDecision {
  const ranked=rankDynamicPipelineCandidates(request,candidates)
  return Object.freeze({
    schemaVersion:DYNAMIC_PIPELINE_ROUTER_SCHEMA_VERSION,
    workloadId:required(request.workloadId,'workload_id'),
    capabilityId:required(request.capabilityId,'capability_id'),
    selected:ranked[0]?.candidate ?? null,
    alternatives:Object.freeze(ranked.slice(1).map(item=>item.candidate)),
    reason:ranked.length?'selected':'no_compatible_pipeline',
    authorityExpanded:false,
  })
}

export function rerouteDynamicPipeline(
  request: DynamicPipelineWorkload,
  candidates: readonly DynamicPipelineCandidate[],
  failedPipelineIds: readonly string[],
): DynamicPipelineRouteDecision {
  return routeDynamicPipeline({
    ...request,
    excludedPipelineIds:Object.freeze([
      ...(request.excludedPipelineIds ?? []),
      ...failedPipelineIds,
    ]),
  },candidates)
}
