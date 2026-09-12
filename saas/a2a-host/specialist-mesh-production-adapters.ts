import type { A2ARuntimeObservationEvent } from './a2a-runtime-observability.ts'
import type { SpecialistQualificationDecision, SpecialistQualificationPort, SpecialistQualificationRequest } from './cos-specialist-orchestrator.ts'
import type { SpecialistMeshLiveSignal, SpecialistMeshSignalPort, SpecialistMeshSignalRequest } from './specialist-mesh-router.ts'

export const SPECIALIST_MESH_PRODUCTION_ADAPTER_VERSION = 'signalboost-specialist-mesh-production-adapter-v1' as const

export interface SpecialistQualificationEvidenceRecord {
  agentId: string
  skillId: string
  qualified: boolean
  evidenceRef: string
  tenantId: string
  environmentId: string
  portableId: string
}

export interface SpecialistQualificationEvidenceReader {
  read(input: SpecialistQualificationRequest): Promise<readonly SpecialistQualificationEvidenceRecord[]>
}

export interface SpecialistMeshObservationReader {
  read(input: SpecialistMeshSignalRequest): Promise<readonly A2ARuntimeObservationEvent[]>
}

export interface SpecialistMeshAvailabilityReader {
  read(input: SpecialistMeshSignalRequest): Promise<Readonly<Record<string, { available: boolean; latencyMs?: number }>>>
}

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, Number(value.toFixed(3))))
}

/** Host-owned durable qualification evidence only; missing or malformed proof fails closed. */
export function createProductionSpecialistQualificationPort(reader: SpecialistQualificationEvidenceReader): SpecialistQualificationPort {
  return Object.freeze({
    async snapshot(input) {
      const requested = new Set(input.agentIds)
      const rows = await reader.read(input)
      const out: Record<string, SpecialistQualificationDecision> = {}
      for (const row of rows) {
        if (!requested.has(row.agentId)) continue
        if (row.tenantId !== input.tenantId || row.environmentId !== input.environmentId || row.portableId !== input.portableId || row.skillId !== input.skillId) continue
        const evidenceRef = String(row.evidenceRef || '').trim()
        if (row.qualified !== true || !evidenceRef) continue
        out[row.agentId] = Object.freeze({ qualified: true, evidenceRef })
      }
      return Object.freeze(out)
    },
  })
}

/**
 * Read-only routing telemetry adapter. Runtime evidence may rank already-authorized/qualified agents,
 * but never creates authority. Missing telemetry stays neutral; explicit unavailable evidence removes a candidate.
 */
export function createProductionSpecialistMeshSignalPort(options: {
  observations: SpecialistMeshObservationReader
  availability?: SpecialistMeshAvailabilityReader
  windowMs?: number
  now?: () => number
}): SpecialistMeshSignalPort {
  const windowMs = Math.max(60_000, Math.min(86_400_000, options.windowMs ?? 900_000))
  const now = options.now ?? Date.now
  return Object.freeze({
    async snapshot(input) {
      const [events, availability] = await Promise.all([
        options.observations.read(input),
        options.availability?.read(input).catch(() => ({})) ?? Promise.resolve({}),
      ])
      const requested = new Set(input.agentIds)
      const cutoff = now() - windowMs
      const grouped = new Map<string, A2ARuntimeObservationEvent[]>()
      for (const event of events) {
        if (!requested.has(event.agentId)) continue
        if (event.tenantId !== input.tenantId || event.environmentId !== input.environmentId || event.portableId !== input.portableId || event.skillId !== input.skillId) continue
        const at = Date.parse(event.occurredAt)
        if (!Number.isFinite(at) || at < cutoff || at > now() + 60_000) continue
        const bucket = grouped.get(event.agentId) ?? []
        bucket.push(event)
        grouped.set(event.agentId, bucket)
      }

      const out: Record<string, SpecialistMeshLiveSignal> = {}
      for (const agentId of input.agentIds) {
        const rows = grouped.get(agentId) ?? []
        const probe = availability[agentId]
        if (rows.length === 0 && !probe) continue
        const successes = rows.filter(row => row.ok).length
        const avgDuration = rows.length ? rows.reduce((sum, row) => sum + Math.max(0, row.durationMs), 0) / rows.length : probe?.latencyMs
        const reliabilityScore = rows.length ? boundedScore((successes / rows.length) * 100) : undefined
        const latencyScore = avgDuration === undefined ? undefined : boundedScore((Math.min(30_000, avgDuration) / 30_000) * 100)
        const loadScore = rows.length ? boundedScore((Math.min(40, rows.length) / 40) * 100) : undefined
        const signal: SpecialistMeshLiveSignal = {
          ...(probe ? { available: probe.available } : {}),
          ...(latencyScore === undefined ? {} : { latencyScore }),
          ...(reliabilityScore === undefined ? {} : { reliabilityScore, qualityScore: reliabilityScore }),
          ...(loadScore === undefined ? {} : { loadScore }),
        }
        out[agentId] = Object.freeze(signal)
      }
      return Object.freeze(out)
    },
  })
}
