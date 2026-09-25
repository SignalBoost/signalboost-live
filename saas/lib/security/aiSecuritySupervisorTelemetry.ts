import 'server-only'
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { AiSecurityDisposition, AiSecurityFinding, AiSecuritySource } from './aiSecurityGateway'

export const AI_SECURITY_SUPERVISOR_OBSERVATION_VERSION = 'ai-security-supervisor-observation-v1' as const

type AuditDb = {
  from(table: string): {
    upsert(value: unknown, options?: unknown): Promise<{ error?: { message?: string } | null }>
  }
}

export type AiSecurityObservationSurface =
  | 'builder_mcp'
  | 'supervisor_connector'
  | 'working_agent_knowledge'
  | 'live_web'
  | 'model_egress'

function severity(findings: readonly AiSecurityFinding[]): 'warning' | 'critical' {
  return findings.some(item => item.severity === 'critical') ? 'critical' : 'warning'
}

function bounded(value: unknown, max = 120): string {
  return String(value ?? '').trim().slice(0, max)
}

function observationFingerprint(input: {
  source: AiSecuritySource
  surface: AiSecurityObservationSurface
  disposition: AiSecurityDisposition
  findings: readonly AiSecurityFinding[]
  traceId?: string
}, now = new Date()): string {
  const fiveMinuteBucket = Math.floor(now.getTime() / 300_000)
  const codes = [...new Set(input.findings.map(item => item.code))].sort().join(',')
  const trace = bounded(input.traceId, 180) || String(fiveMinuteBucket)
  return createHash('sha256')
    .update([input.source, input.surface, input.disposition, codes, trace].join('|'))
    .digest('hex')
    .slice(0, 32)
}

export async function writeAiSecuritySupervisorObservation(
  db: AuditDb,
  input: {
    source: AiSecuritySource
    surface: AiSecurityObservationSurface
    disposition: AiSecurityDisposition
    findings: readonly AiSecurityFinding[]
    redactedCount?: number
    traceId?: string
  },
  options: { now?: Date } = {},
): Promise<boolean> {
  if (!input.findings.length) return false
  const now = options.now ?? new Date()
  const fingerprint = observationFingerprint(input, now)
  const eventId = `ai-security-observation-${fingerprint}`
  const incidentId = `ai-security:${fingerprint}`
  const findingCodes = [...new Set(input.findings.map(item => item.code))].sort()
  const result = await db.from('supervisor_audit_events').upsert({
    event_id: eventId,
    incident_id: incidentId,
    event_type: 'ai_security_observation_recorded',
    occurred_at: now.toISOString(),
    payload: {
      source: input.source,
      surface: input.surface,
      disposition: input.disposition,
      severity: severity(input.findings),
      findingCodes,
      findingCount: input.findings.length,
      redactedCount: Math.max(0, Math.floor(Number(input.redactedCount || 0))),
      rawContentPersisted: false,
      userProfilePersisted: false,
      authorityGranted: false,
      automaticRepairAuthorized: false,
      sampledFingerprint: fingerprint,
    },
    schema_version: AI_SECURITY_SUPERVISOR_OBSERVATION_VERSION,
  }, { onConflict: 'event_id', ignoreDuplicates: true })
  if (result.error) throw new Error(`ai_security_observation_persist_failed:${String(result.error.message || 'unknown').slice(0, 160)}`)
  return true
}

/**
 * Best-effort telemetry only. Failure to persist an observation must never make an otherwise-safe
 * user request unavailable. Consequential execution remains governed by Referee/Agent Gateway.
 */
export async function recordAiSecuritySupervisorObservation(input: {
  source: AiSecuritySource
  surface: AiSecurityObservationSurface
  disposition: AiSecurityDisposition
  findings: readonly AiSecurityFinding[]
  redactedCount?: number
  traceId?: string
}): Promise<boolean> {
  if (!input.findings.length) return false
  const db = cosServiceDb() as unknown as AuditDb | null
  if (!db) return false
  try {
    return await writeAiSecuritySupervisorObservation(db, input)
  } catch (error) {
    console.warn('[ai-security-observation] persistence unavailable', error instanceof Error ? error.message : String(error))
    return false
  }
}
