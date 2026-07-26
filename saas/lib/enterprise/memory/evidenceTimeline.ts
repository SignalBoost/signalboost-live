// saas/lib/enterprise/memory/evidenceTimeline.ts
// Deterministic timeline reconstruction from normalized, correlated evidence.
// Timelines preserve observed order and durations; they never invent missing events or claim causation.

import type { EnterpriseEvidenceEvent } from './evidenceBus.ts'
import type { EvidenceCorrelationLink, EvidenceCorrelationResult } from './evidenceCorrelation.ts'

export type EvidenceTimelineEntry = Readonly<{
  sequence: number
  eventId: string
  type: EnterpriseEvidenceEvent['type']
  agent: EnterpriseEvidenceEvent['agent']
  occurredAt: string
  elapsedFromPreviousMs: number | null
  confidence: number
  correlationReasons: readonly string[]
  relatedEventIds: readonly string[]
  entities: EnterpriseEvidenceEvent['entities']
  payload: EnterpriseEvidenceEvent['payload']
}>

export type EvidenceTimeline = Readonly<{
  organizationId: string
  startedAt: string
  endedAt: string
  durationMs: number
  entries: readonly EvidenceTimelineEntry[]
}>

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('Timeline event occurredAt must be a valid date.')
  return parsed
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function indexLinks(links: readonly EvidenceCorrelationLink[]): Map<string, EvidenceCorrelationLink[]> {
  const index = new Map<string, EvidenceCorrelationLink[]>()
  for (const link of links) {
    for (const eventId of [link.leftEventId, link.rightEventId]) {
      const current = index.get(eventId) || []
      current.push(link)
      index.set(eventId, current)
    }
  }
  return index
}

export function reconstructEnterpriseEvidenceTimeline(
  correlation: EvidenceCorrelationResult,
  options: {
    organizationId?: string
    startAt?: string
    endAt?: string
    eventIds?: readonly string[]
    maxEntries?: number
    correlatedOnly?: boolean
  } = {},
): EvidenceTimeline | null {
  const maxEntries = options.maxEntries ?? 200
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) {
    throw new Error('Evidence timeline maxEntries must be an integer from 1 to 1000.')
  }

  const organizationId = clean(options.organizationId)
  const startMs = options.startAt ? timestamp(options.startAt) : Number.NEGATIVE_INFINITY
  const endMs = options.endAt ? timestamp(options.endAt) : Number.POSITIVE_INFINITY
  if (startMs > endMs) throw new Error('Evidence timeline startAt cannot be after endAt.')

  const allowedEventIds = options.eventIds ? new Set(options.eventIds.map(clean).filter(Boolean)) : null
  const linksByEvent = indexLinks(correlation.links)

  const events = correlation.events
    .filter(event => !organizationId || clean(event.organizationId) === organizationId)
    .filter(event => {
      const occurred = timestamp(event.occurredAt)
      return occurred >= startMs && occurred <= endMs
    })
    .filter(event => !allowedEventIds || allowedEventIds.has(event.eventId))
    .filter(event => !options.correlatedOnly || (linksByEvent.get(event.eventId)?.length || 0) > 0)
    .sort((a, b) => timestamp(a.occurredAt) - timestamp(b.occurredAt) || a.eventId.localeCompare(b.eventId))
    .slice(0, maxEntries)

  if (!events.length) return null

  const resolvedOrganizationId = organizationId || events[0].organizationId
  const entries = events.map((event, index): EvidenceTimelineEntry => {
    const links = linksByEvent.get(event.eventId) || []
    const relatedEventIds = [...new Set(links.map(link => link.leftEventId === event.eventId ? link.rightEventId : link.leftEventId))]
      .sort()
    const correlationReasons = [...new Set(links.flatMap(link => link.reasons))].sort()
    const previous = index > 0 ? events[index - 1] : null

    return Object.freeze({
      sequence: index + 1,
      eventId: event.eventId,
      type: event.type,
      agent: event.agent,
      occurredAt: event.occurredAt,
      elapsedFromPreviousMs: previous ? timestamp(event.occurredAt) - timestamp(previous.occurredAt) : null,
      confidence: clamp01(event.confidence),
      correlationReasons: Object.freeze(correlationReasons),
      relatedEventIds: Object.freeze(relatedEventIds),
      entities: event.entities,
      payload: event.payload,
    })
  })

  const startedAt = events[0].occurredAt
  const endedAt = events[events.length - 1].occurredAt

  return Object.freeze({
    organizationId: resolvedOrganizationId,
    startedAt,
    endedAt,
    durationMs: timestamp(endedAt) - timestamp(startedAt),
    entries: Object.freeze(entries),
  })
}
