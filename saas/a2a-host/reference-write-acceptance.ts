import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveReferenceA2AOrigin } from './reference-a2a-config.ts'
import type { A2AMeshWriteRecoveryEnvelope } from './a2a-delegation-runtime.ts'

export const REFERENCE_WRITE_ACCEPTANCE_VERSION = 'signalboost-reference-write-acceptance-v1' as const
export const REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID = 'signalboost-reference-publish-provider-v1' as const
export const REFERENCE_WRITE_ACCEPTANCE_SKILL_ID = 'marketing.publish' as const
export const PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID = 'signalboost-reference-write-acceptance-primary' as const
export const SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID = 'signalboost-reference-write-acceptance-secondary' as const

export type ReferenceWriteAcceptanceAgentId =
  | typeof PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID
  | typeof SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID

function required(value: unknown, name: string, max = 2048): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*' || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`reference_write_acceptance_${name}_invalid`)
  }
  return normalized
}

export function referenceWriteAcceptanceEndpoint(agentId: ReferenceWriteAcceptanceAgentId, env: NodeJS.ProcessEnv = process.env): string {
  const path = agentId === PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID
    ? '/api/a2a/reference-write-acceptance-primary'
    : '/api/a2a/reference-write-acceptance-secondary'
  return new URL(path, resolveReferenceA2AOrigin(env)).toString()
}

export function referenceWriteAcceptanceAgentCard(agentId: ReferenceWriteAcceptanceAgentId, env: NodeJS.ProcessEnv = process.env) {
  const primary = agentId === PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID
  return Object.freeze({
    protocolVersion: '0.3.0',
    name: primary ? 'SignalBoost Reference Write Acceptance Specialist A' : 'SignalBoost Reference Write Acceptance Specialist B',
    description: 'Production-acceptance-only A2A writer. It publishes an inert idempotent marker to the SignalBoost reference provider; it does not publish customer content.',
    url: referenceWriteAcceptanceEndpoint(agentId, env),
    preferredTransport: 'JSONRPC',
    version: REFERENCE_WRITE_ACCEPTANCE_VERSION,
    capabilities: Object.freeze({ streaming: false, pushNotifications: false }),
    defaultInputModes: Object.freeze(['text/plain']),
    defaultOutputModes: Object.freeze(['application/json']),
    skills: Object.freeze([Object.freeze({
      id: REFERENCE_WRITE_ACCEPTANCE_SKILL_ID,
      name: 'Reference governed publish',
      description: 'Exercise an approved idempotent publish write against the isolated SignalBoost Production acceptance provider.',
      tags: Object.freeze(['marketing', 'publish', 'write', 'production-acceptance', 'reference']),
      inputModes: Object.freeze(['text/plain']),
      outputModes: Object.freeze(['application/json']),
    })]),
  })
}

export function parseReferenceWriteRecoveryEnvelope(raw: unknown): A2AMeshWriteRecoveryEnvelope {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('reference_write_acceptance_recovery_envelope_missing')
  const envelope = value as Partial<A2AMeshWriteRecoveryEnvelope>
  if (envelope.schemaVersion !== 'signalboost-specialist-mesh-write-recovery-v1') throw new Error('reference_write_acceptance_recovery_schema_invalid')
  if (required(envelope.providerId, 'provider_id', 256) !== REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID) throw new Error('reference_write_acceptance_provider_invalid')
  return Object.freeze({
    schemaVersion: envelope.schemaVersion,
    operationKey: required(envelope.operationKey, 'operation_key'),
    providerId: REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
    idempotencyKey: required(envelope.idempotencyKey, 'idempotency_key', 512),
  })
}

export function referenceWriteAcceptancePayloadDigest(text: string): string {
  return `sha256:${createHash('sha256').update(required(text, 'text', 32_000), 'utf8').digest('hex')}`
}

export function referenceWriteAcceptanceIdempotencyKey(operationKey: string): string {
  return `sb-write-acceptance:${createHash('sha256').update(required(operationKey, 'operation_key'), 'utf8').digest('hex')}`
}

export async function applyReferenceWriteAcceptanceEffect(input: {
  db: SupabaseClient
  agentId: ReferenceWriteAcceptanceAgentId
  envelope: A2AMeshWriteRecoveryEnvelope
  text: string
}) {
  const payloadDigest = referenceWriteAcceptancePayloadDigest(input.text)
  const { data, error } = await input.db.rpc('a2a_specialist_mesh_write_acceptance_apply', {
    p_operation_key: input.envelope.operationKey,
    p_idempotency_key: input.envelope.idempotencyKey,
    p_agent_id: input.agentId,
    p_payload_digest: payloadDigest,
  })
  if (error) throw new Error(`reference_write_acceptance_provider_apply_failed:${error.message}`)
  const row = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  return Object.freeze({
    operationKey: required(row.operation_key ?? input.envelope.operationKey, 'result_operation_key'),
    idempotencyKey: required(row.idempotency_key ?? input.envelope.idempotencyKey, 'result_idempotency_key', 512),
    appliedByAgent: required(row.applied_by_agent ?? input.agentId, 'result_agent_id'),
    payloadDigest: required(row.payload_digest ?? payloadDigest, 'result_payload_digest'),
    createdAt: required(row.created_at, 'result_created_at'),
  })
}
