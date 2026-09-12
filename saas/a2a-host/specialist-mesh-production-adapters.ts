import type { SupabaseClient } from '@supabase/supabase-js'
import type { A2ARuntimeObservationEvent } from './a2a-runtime-observability.ts'
import type { SpecialistQualificationDecision, SpecialistQualificationPort, SpecialistQualificationRequest } from './cos-specialist-orchestrator.ts'
import type { SpecialistMeshLiveSignal, SpecialistMeshSignalPort, SpecialistMeshSignalRequest } from './specialist-mesh-router.ts'

export const SPECIALIST_MESH_PRODUCTION_ADAPTER_VERSION = 'signalboost-specialist-mesh-production-adapter-v6' as const

export interface SpecialistQualificationEvidenceRecord {
  agentId: string
  skillId: string
  qualified: boolean
  evidenceRef: string
  tenantId: string
  environmentId: string
  portableId: string
  observedAt?: string
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

function evidenceTime(value: unknown): number {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

/** Only observations created after the host-owned transport send method is entered may affect worker quality/reliability. */
function attemptedSpecialistExecution(event: A2ARuntimeObservationEvent): boolean {
  if (event.executionAttempted !== true) return false
  return event.mode === 'delegated' || event.mode === 'a2a_transport_unavailable' || event.mode === 'a2a_runtime_error'
}

/** Host-owned durable qualification evidence only; newest exact-scope decision wins independent of reader order. */
export function createProductionSpecialistQualificationPort(reader: SpecialistQualificationEvidenceReader): SpecialistQualificationPort {
  return Object.freeze({
    async snapshot(input) {
      const requested = new Set(input.agentIds)
      const rows = (await reader.read(input))
        .filter(row => requested.has(row.agentId))
        .filter(row => row.tenantId === input.tenantId && row.environmentId === input.environmentId && row.portableId === input.portableId && row.skillId === input.skillId)
        .sort((a, b) => {
          const time = evidenceTime(b.observedAt) - evidenceTime(a.observedAt)
          if (time !== 0) return time
          if (a.qualified !== b.qualified) return a.qualified ? 1 : -1
          return String(a.evidenceRef ?? '').localeCompare(String(b.evidenceRef ?? ''))
        })
      const out: Record<string, SpecialistQualificationDecision> = {}
      const decided = new Set<string>()
      for (const row of rows) {
        if (decided.has(row.agentId)) continue
        decided.add(row.agentId)
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
      const current = now()
      const cutoff = current - windowMs
      const grouped = new Map<string, A2ARuntimeObservationEvent[]>()
      for (const event of events) {
        if (!requested.has(event.agentId)) continue
        if (event.tenantId !== input.tenantId || event.environmentId !== input.environmentId || event.portableId !== input.portableId || event.skillId !== input.skillId) continue
        const at = Date.parse(event.occurredAt)
        if (!Number.isFinite(at) || at < cutoff || at > current + 60_000) continue
        if (!attemptedSpecialistExecution(event)) continue
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

type QualificationRow = {
  agent_id: string
  skill_id: string
  qualified: boolean
  evidence_ref: string
  tenant_id: string
  environment_id: string
  portable_id: string
  observed_at: string
}

type TelemetryRow = {
  event_key: string
  agent_id: string
  available: boolean | null
  latency_score: number | null
  cost_score: number | null
  load_score: number | null
  reliability_score: number | null
  quality_score: number | null
  observed_at: string
}

/** Service-role Production adapter. Browser clients receive no policies for these tables. */
export function createSupabaseSpecialistMeshProductionAdapters(db: SupabaseClient, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date())
  const qualifications = createProductionSpecialistQualificationPort({
    async read(input) {
      const agentIds = [...new Set(input.agentIds)]
      if (!agentIds.length) return []
      const current = now()
      const at = current.toISOString()
      const futureCutoff = new Date(current.getTime() + 60_000).toISOString()
      const batches = await Promise.all(agentIds.map(async agentId => {
        const { data, error } = await db.from('a2a_specialist_qualifications')
          .select('agent_id,skill_id,qualified,evidence_ref,tenant_id,environment_id,portable_id,observed_at')
          .eq('tenant_id', input.tenantId).eq('environment_id', input.environmentId).eq('portable_id', input.portableId)
          .eq('skill_id', input.skillId).eq('agent_id', agentId)
          .lte('valid_from', at).gt('valid_until', at).lte('observed_at', futureCutoff)
          .order('observed_at', { ascending: false })
          .order('qualified', { ascending: true })
          .order('evidence_ref', { ascending: true })
          .limit(1)
        if (error) throw error
        return ((data ?? []) as QualificationRow[])
          .filter(row => row.agent_id === agentId)
          .filter(row => evidenceTime(row.observed_at) <= current.getTime() + 60_000)
          .map(row => ({
            agentId: row.agent_id, skillId: row.skill_id, qualified: row.qualified, evidenceRef: row.evidence_ref,
            tenantId: row.tenant_id, environmentId: row.environment_id, portableId: row.portable_id, observedAt: row.observed_at,
          }))
      }))
      return batches.flat()
    },
  })

  const meshSignals: SpecialistMeshSignalPort = Object.freeze({
    async snapshot(input) {
      const agentIds = [...new Set(input.agentIds)]
      if (!agentIds.length) return {}
      const current = now()
      const at = current.toISOString()
      const futureCutoff = new Date(current.getTime() + 60_000).toISOString()
      const batches = await Promise.all(agentIds.map(async agentId => {
        const { data, error } = await db.from('a2a_specialist_mesh_telemetry')
          .select('event_key,agent_id,available,latency_score,cost_score,load_score,reliability_score,quality_score,observed_at')
          .eq('tenant_id', input.tenantId).eq('environment_id', input.environmentId).eq('portable_id', input.portableId)
          .eq('skill_id', input.skillId).eq('agent_id', agentId)
          .gt('expires_at', at).lte('observed_at', futureCutoff)
          .order('observed_at', { ascending: false })
          .order('available', { ascending: true })
          .order('event_key', { ascending: true })
          .limit(1)
        if (error) return [] as TelemetryRow[]
        return ((data ?? []) as TelemetryRow[])
          .filter(row => row.agent_id === agentId)
          .filter(row => evidenceTime(row.observed_at) <= current.getTime() + 60_000)
          .sort((a, b) => {
            const time = evidenceTime(b.observed_at) - evidenceTime(a.observed_at)
            if (time !== 0) return time
            if (a.available !== b.available) {
              if (a.available === false) return -1
              if (b.available === false) return 1
              if (a.available === true) return -1
              if (b.available === true) return 1
            }
            return String(a.event_key ?? '').localeCompare(String(b.event_key ?? ''))
          })
          .slice(0, 1)
      }))
      const out: Record<string, SpecialistMeshLiveSignal> = {}
      for (const row of batches.flat()) {
        out[row.agent_id] = Object.freeze({
          ...(typeof row.available === 'boolean' ? { available: row.available } : {}),
          ...(row.latency_score === null ? {} : { latencyScore: boundedScore(Number(row.latency_score)) }),
          ...(row.cost_score === null ? {} : { costScore: boundedScore(Number(row.cost_score)) }),
          ...(row.load_score === null ? {} : { loadScore: boundedScore(Number(row.load_score)) }),
          ...(row.reliability_score === null ? {} : { reliabilityScore: boundedScore(Number(row.reliability_score)) }),
          ...(row.quality_score === null ? {} : { qualityScore: boundedScore(Number(row.quality_score)) }),
        })
      }
      return Object.freeze(out)
    },
  })

  return Object.freeze({ qualifications, meshSignals })
}
