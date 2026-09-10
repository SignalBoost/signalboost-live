import { createHash } from 'node:crypto'
import { canonicalSecurityJson, type SecurityAction, type SecurityRole, type SecurityTarget } from './engagement.ts'

export const SECURITY_EVIDENCE_SCHEMA = 'itmounts-security-evidence-v1' as const
export const SECURITY_EVIDENCE_GENESIS_HASH = '0'.repeat(64)

export type SecurityEvidenceValue = string | number | boolean | null

export interface SecurityEvidenceObservation {
  id: string
  kind: string
  source: string
  collectedAt: string
  value: SecurityEvidenceValue
}

export interface SecurityAttributionHypothesis {
  id: string
  hypothesis: string
  confidence: number
  basisObservationIds: readonly string[]
  alternatives: readonly string[]
}

export type SecurityEvidenceDecision = 'observed' | 'allowed' | 'denied' | 'changed' | 'verified'

export interface SecurityIncidentEvidenceEvent {
  eventId: string
  engagementId: string
  recordedAt: string
  actorRole: SecurityRole
  action: SecurityAction
  decision: SecurityEvidenceDecision
  target?: SecurityTarget
  observations: readonly SecurityEvidenceObservation[]
  attributionHypotheses: readonly SecurityAttributionHypothesis[]
}

export interface SecurityEvidenceChainEntry {
  schema: typeof SECURITY_EVIDENCE_SCHEMA
  index: number
  previousHash: string
  hash: string
  event: SecurityIncidentEvidenceEvent
}

function validText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function validTime(value: unknown): value is string {
  return validText(value, 128) && Number.isFinite(Date.parse(value))
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function copyObservation(value: SecurityEvidenceObservation): Readonly<SecurityEvidenceObservation> {
  if (!validText(value?.id, 256)) throw new Error('security_evidence_observation_id_invalid')
  if (!validText(value?.kind, 256)) throw new Error('security_evidence_observation_kind_invalid')
  if (!validText(value?.source, 512)) throw new Error('security_evidence_observation_source_invalid')
  if (!validTime(value?.collectedAt)) throw new Error('security_evidence_observation_time_invalid')
  if (!['string', 'number', 'boolean'].includes(typeof value.value) && value.value !== null) throw new Error('security_evidence_observation_value_invalid')
  if (typeof value.value === 'number' && !Number.isFinite(value.value)) throw new Error('security_evidence_observation_value_invalid')
  if (typeof value.value === 'string' && value.value.length > 4096) throw new Error('security_evidence_observation_value_too_large')
  return Object.freeze({
    id: value.id,
    kind: value.kind,
    source: value.source,
    collectedAt: value.collectedAt,
    value: value.value,
  })
}

function copyAttribution(
  value: SecurityAttributionHypothesis,
  observationIds: ReadonlySet<string>,
): Readonly<SecurityAttributionHypothesis> {
  if (!validText(value?.id, 256)) throw new Error('security_attribution_id_invalid')
  if (!validText(value?.hypothesis, 2048)) throw new Error('security_attribution_hypothesis_invalid')
  if (!Number.isFinite(value?.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error('security_attribution_confidence_invalid')
  if (!Array.isArray(value.basisObservationIds) || value.basisObservationIds.some(id => !observationIds.has(id))) {
    throw new Error('security_attribution_basis_invalid')
  }
  if (!Array.isArray(value.alternatives) || value.alternatives.some(item => !validText(item, 1024))) {
    throw new Error('security_attribution_alternatives_invalid')
  }
  return Object.freeze({
    id: value.id,
    hypothesis: value.hypothesis,
    confidence: value.confidence,
    basisObservationIds: Object.freeze([...new Set(value.basisObservationIds)]),
    alternatives: Object.freeze([...new Set(value.alternatives)]),
  })
}

function copyTarget(target: SecurityTarget | undefined): Readonly<SecurityTarget> | undefined {
  if (!target) return undefined
  if (!validText(target.value, 512)) throw new Error('security_evidence_target_invalid')
  return Object.freeze({ kind: target.kind, value: target.value })
}

function copyEvidenceEvent(value: SecurityIncidentEvidenceEvent): Readonly<SecurityIncidentEvidenceEvent> {
  if (!validText(value?.eventId, 256)) throw new Error('security_evidence_event_id_invalid')
  if (!validText(value?.engagementId, 256)) throw new Error('security_evidence_engagement_id_invalid')
  if (!validTime(value?.recordedAt)) throw new Error('security_evidence_recorded_at_invalid')
  if (value.actorRole !== 'guardian' && value.actorRole !== 'stranger') throw new Error('security_evidence_actor_role_invalid')
  if (!['observed', 'allowed', 'denied', 'changed', 'verified'].includes(value.decision)) throw new Error('security_evidence_decision_invalid')
  if (!Array.isArray(value.observations) || !Array.isArray(value.attributionHypotheses)) throw new Error('security_evidence_sections_required')

  const observations = Object.freeze(value.observations.map(copyObservation))
  const observationIds = new Set(observations.map(item => item.id))
  if (observationIds.size !== observations.length) throw new Error('security_evidence_observation_ids_must_be_unique')
  const attributionHypotheses = Object.freeze(value.attributionHypotheses.map(item => copyAttribution(item, observationIds)))
  if (new Set(attributionHypotheses.map(item => item.id)).size !== attributionHypotheses.length) {
    throw new Error('security_attribution_ids_must_be_unique')
  }
  const target = copyTarget(value.target)

  return Object.freeze({
    eventId: value.eventId,
    engagementId: value.engagementId,
    recordedAt: value.recordedAt,
    actorRole: value.actorRole,
    action: value.action,
    decision: value.decision,
    ...(target ? { target } : {}),
    observations,
    attributionHypotheses,
  })
}

function entryHash(index: number, previousHash: string, event: SecurityIncidentEvidenceEvent): string {
  return createHash('sha256')
    .update(canonicalSecurityJson({ schema: SECURITY_EVIDENCE_SCHEMA, index, previousHash, event }))
    .digest('hex')
}

export function appendSecurityEvidence(
  chain: readonly SecurityEvidenceChainEntry[],
  event: SecurityIncidentEvidenceEvent,
): readonly SecurityEvidenceChainEntry[] {
  const safeEvent = copyEvidenceEvent(event)
  const index = chain.length
  const previousHash = index === 0 ? SECURITY_EVIDENCE_GENESIS_HASH : chain[index - 1].hash
  if (!validHash(previousHash)) throw new Error('security_evidence_previous_hash_invalid')

  const entry = Object.freeze({
    schema: SECURITY_EVIDENCE_SCHEMA,
    index,
    previousHash,
    hash: entryHash(index, previousHash, safeEvent),
    event: safeEvent,
  })
  return Object.freeze([...chain, entry])
}

export function verifySecurityEvidenceChain(chain: readonly SecurityEvidenceChainEntry[]): boolean {
  let previousHash = SECURITY_EVIDENCE_GENESIS_HASH
  for (let index = 0; index < chain.length; index += 1) {
    const entry = chain[index]
    if (!entry || entry.schema !== SECURITY_EVIDENCE_SCHEMA || entry.index !== index) return false
    if (entry.previousHash !== previousHash || !validHash(entry.hash)) return false
    try {
      if (entry.hash !== entryHash(index, previousHash, entry.event)) return false
    } catch {
      return false
    }
    previousHash = entry.hash
  }
  return true
}
