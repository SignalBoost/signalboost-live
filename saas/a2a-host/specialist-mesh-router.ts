import type { RegisteredA2AAgent } from './a2a-agent-registry.ts'

export const SPECIALIST_MESH_ROUTER_VERSION = 'signalboost-specialist-mesh-router-v3' as const

export interface SpecialistMeshCandidate {
  agentId: string
  metadata?: RegisteredA2AAgent['metadata']
}

export interface SpecialistMeshLiveSignal {
  available?: boolean
  costScore?: number
  loadScore?: number
  latencyScore?: number
  reliabilityScore?: number
  qualityScore?: number
}

export interface SpecialistMeshSignalRequest {
  tenantId: string
  environmentId: string
  portableId: string
  skillId: string
  agentIds: readonly string[]
}

/** Read-only telemetry. Signals rank candidates; they never grant skill, scope, risk, or authority. */
export interface SpecialistMeshSignalPort {
  snapshot(input: SpecialistMeshSignalRequest): Promise<Readonly<Record<string, SpecialistMeshLiveSignal>>>
}

export interface SpecialistMeshRankedCandidate extends SpecialistMeshCandidate {
  meshScore: number
}

const DEFAULT_SCORE = 50

function boundedScore(value: unknown, fallback = DEFAULT_SCORE): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, value))
}

function bool(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function metric(signal: SpecialistMeshLiveSignal | undefined, liveKey: keyof SpecialistMeshLiveSignal, metadata: RegisteredA2AAgent['metadata'] | undefined, metadataKey: string): unknown {
  const live = signal?.[liveKey]
  return live === undefined ? metadata?.[metadataKey] : live
}

/**
 * Rank already-authorized specialist candidates by current operational suitability.
 * Lower meshScore is better. Live signals override static metadata when present.
 * This function never grants authority or qualification.
 */
export function rankSpecialistMeshCandidates(
  candidates: readonly SpecialistMeshCandidate[],
  liveSignals: Readonly<Record<string, SpecialistMeshLiveSignal>> = {},
): readonly SpecialistMeshRankedCandidate[] {
  return Object.freeze(candidates
    .filter(candidate => {
      const signal = liveSignals[candidate.agentId]
      const available = signal?.available === undefined ? candidate.metadata?.meshAvailable : signal.available
      return bool(available, true)
    })
    .map(candidate => {
      const signal = liveSignals[candidate.agentId]
      const cost = boundedScore(metric(signal, 'costScore', candidate.metadata, 'meshCostScore'))
      const load = boundedScore(metric(signal, 'loadScore', candidate.metadata, 'meshLoadScore'))
      const latency = boundedScore(metric(signal, 'latencyScore', candidate.metadata, 'meshLatencyScore'))
      const reliabilityPenalty = 100 - boundedScore(metric(signal, 'reliabilityScore', candidate.metadata, 'meshReliabilityScore'))
      const qualityPenalty = 100 - boundedScore(metric(signal, 'qualityScore', candidate.metadata, 'meshQualityScore'))
      const meshScore = Number((
        (cost * 0.30) +
        (load * 0.25) +
        (latency * 0.20) +
        (reliabilityPenalty * 0.15) +
        (qualityPenalty * 0.10)
      ).toFixed(6))
      return Object.freeze({ ...candidate, meshScore })
    })
    .sort((a, b) => a.meshScore - b.meshScore || a.agentId.localeCompare(b.agentId)))
}

/** Only absence or a proven transient transport failure can trigger advisory failover. */
export function isRecoverableMeshDelegationFailure(mode: string | undefined): boolean {
  return mode === 'agent_unavailable' || mode === 'a2a_transport_unavailable'
}
