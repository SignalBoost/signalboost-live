// saas/lib/enterprise/memory/evidenceCorrelation.ts
// Deterministic correlation for normalized cross-agent evidence events.
// Correlation expresses related evidence only; it never claims causation or authorizes execution.

import type { EnterpriseEvidenceEvent } from './evidenceBus.ts'

export type EvidenceCorrelationReason =
  | 'correlation_id'
  | 'campaign_id'
  | 'commit_sha'
  | 'deployment_id'
  | 'incident_id'
  | 'repository'
  | 'session_id'
  | 'time_proximity'

export type EvidenceCorrelationLink = Readonly<{
  id: string
  leftEventId: string
  rightEventId: string
  organizationId: string
  confidence: number
  reasons: readonly EvidenceCorrelationReason[]
  occurredAtDistanceMs: number
}>

export type EvidenceCorrelationResult = Readonly<{
  events: readonly EnterpriseEvidenceEvent[]
  links: readonly EvidenceCorrelationLink[]
}>

const ENTITY_WEIGHTS: Readonly<Record<Exclude<EvidenceCorrelationReason, 'correlation_id' | 'time_proximity'>, number>> = Object.freeze({
  campaign_id: 0.75,
  commit_sha: 0.9,
  deployment_id: 0.95,
  incident_id: 0.95,
  repository: 0.55,
  session_id: 0.8,
})

const ENTITY_KEYS = Object.freeze([
  ['campaignId', 'campaign_id'],
  ['commitSha', 'commit_sha'],
  ['deploymentId', 'deployment_id'],
  ['incidentId', 'incident_id'],
  ['repository', 'repository'],
  ['sessionId', 'session_id'],
] as const)

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function pairId(leftEventId: string, rightEventId: string): string {
  return [leftEventId, rightEventId].sort().join('|')
}

export function correlateEnterpriseEvidenceEvents(
  input: readonly EnterpriseEvidenceEvent[],
  options: { maxTimeDistanceMs?: number; minimumConfidence?: number; maxLinks?: number } = {},
): EvidenceCorrelationResult {
  const maxTimeDistanceMs = options.maxTimeDistanceMs ?? 15 * 60 * 1000
  const minimumConfidence = options.minimumConfidence ?? 0.45
  const maxLinks = options.maxLinks ?? 500

  if (!Number.isSafeInteger(maxTimeDistanceMs) || maxTimeDistanceMs < 0 || maxTimeDistanceMs > 24 * 60 * 60 * 1000) {
    throw new Error('Evidence correlation maxTimeDistanceMs must be an integer from 0 to 86400000.')
  }
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('Evidence correlation minimumConfidence must be from 0 to 1.')
  }
  if (!Number.isSafeInteger(maxLinks) || maxLinks < 1 || maxLinks > 5000) {
    throw new Error('Evidence correlation maxLinks must be an integer from 1 to 5000.')
  }

  const events = Object.freeze([...input]
    .filter(event => Boolean(clean(event.eventId)) && Boolean(clean(event.organizationId)))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId)))

  const links: EvidenceCorrelationLink[] = []

  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      if (links.length >= maxLinks) break
      const left = events[leftIndex]
      const right = events[rightIndex]
      if (clean(left.organizationId) !== clean(right.organizationId)) continue

      const distance = Math.abs(Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      const reasons: EvidenceCorrelationReason[] = []
      let strongestIdentifier = 0

      if (clean(left.correlationId) && clean(left.correlationId) === clean(right.correlationId)) {
        reasons.push('correlation_id')
        strongestIdentifier = 1
      }

      for (const [entityKey, reason] of ENTITY_KEYS) {
        const leftValue = clean(left.entities[entityKey])
        const rightValue = clean(right.entities[entityKey])
        if (leftValue && leftValue === rightValue) {
          reasons.push(reason)
          strongestIdentifier = Math.max(strongestIdentifier, ENTITY_WEIGHTS[reason])
        }
      }

      const timeScore = maxTimeDistanceMs > 0 && distance <= maxTimeDistanceMs
        ? 1 - distance / maxTimeDistanceMs
        : distance === 0 && maxTimeDistanceMs === 0 ? 1 : 0

      if (timeScore > 0) reasons.push('time_proximity')
      if (!strongestIdentifier) continue

      const evidenceConfidence = (clamp01(left.confidence) + clamp01(right.confidence)) / 2
      const confidence = clamp01(strongestIdentifier * 0.7 + timeScore * 0.15 + evidenceConfidence * 0.15)
      if (confidence < minimumConfidence) continue

      links.push(Object.freeze({
        id: pairId(left.eventId, right.eventId),
        leftEventId: left.eventId,
        rightEventId: right.eventId,
        organizationId: left.organizationId,
        confidence: Math.round(confidence * 1000) / 1000,
        reasons: Object.freeze([...new Set(reasons)]),
        occurredAtDistanceMs: distance,
      }))
    }
    if (links.length >= maxLinks) break
  }

  return Object.freeze({
    events,
    links: Object.freeze(links.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))),
  })
}
