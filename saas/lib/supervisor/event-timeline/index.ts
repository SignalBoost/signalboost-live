export const supervisorEventKinds = [
  'incident', 'work_item', 'lease', 'observation', 'health', 'approval', 'operator', 'kill_switch',
] as const
export type SupervisorEventKind = typeof supervisorEventKinds[number]
export type SupervisorEventSeverity = 'info' | 'warning' | 'critical'

export interface SupervisorTimelineSource {
  source: string
  sourceId: string
  occurredAt: string
  kind: SupervisorEventKind
  action: string
  incidentId?: string
  correlationId?: string
  provider?: string
  severity?: SupervisorEventSeverity
  actorType?: 'system' | 'supervisor' | 'operator' | 'provider'
  actorId?: string
  metadata?: Record<string, unknown>
}

export interface SupervisorTimelineEvent {
  eventId: string
  source: string
  sourceId: string
  occurredAt: string
  kind: SupervisorEventKind
  action: string
  incidentId?: string
  correlationId?: string
  provider?: string
  severity: SupervisorEventSeverity
  actorType: 'system' | 'supervisor' | 'operator' | 'provider'
  actorId?: string
  metadata: Record<string, string | number | boolean | null>
  schemaVersion: 'supervisor-timeline-event-v1'
}

export interface SupervisorTimeline {
  events: SupervisorTimelineEvent[]
  totals: { events: number; incidents: number; correlations: number; critical: number }
  schemaVersion: 'supervisor-timeline-v1'
}

const primitiveMetadata = (value: Record<string, unknown> = {}) => Object.fromEntries(
  Object.entries(value)
    .filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
    .sort(([a], [b]) => a.localeCompare(b)),
) as Record<string, string | number | boolean | null>

const validTime = (value: string) => Number.isFinite(Date.parse(value))

export function createSupervisorTimeline(
  sources: SupervisorTimelineSource[],
  options: { incidentId?: string; correlationId?: string; limit?: number } = {},
): SupervisorTimeline {
  const deduplicated = new Map<string, SupervisorTimelineEvent>()

  for (const source of sources) {
    if (!source.source || !source.sourceId || !source.action || !validTime(source.occurredAt)) continue
    if (options.incidentId && source.incidentId !== options.incidentId) continue
    if (options.correlationId && source.correlationId !== options.correlationId) continue

    const eventId = `${source.source}:${source.sourceId}:${source.action}`
    if (deduplicated.has(eventId)) continue
    deduplicated.set(eventId, {
      eventId,
      source: source.source,
      sourceId: source.sourceId,
      occurredAt: new Date(source.occurredAt).toISOString(),
      kind: source.kind,
      action: source.action,
      incidentId: source.incidentId,
      correlationId: source.correlationId,
      provider: source.provider,
      severity: source.severity ?? 'info',
      actorType: source.actorType ?? 'system',
      actorId: source.actorId,
      metadata: primitiveMetadata(source.metadata),
      schemaVersion: 'supervisor-timeline-event-v1',
    })
  }

  const ordered = [...deduplicated.values()].sort((a, b) => {
    const byTime = Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
    return byTime || a.eventId.localeCompare(b.eventId)
  })
  const events = ordered.slice(0, Math.max(0, options.limit ?? 200))

  return {
    events,
    totals: {
      events: events.length,
      incidents: new Set(events.map(event => event.incidentId).filter(Boolean)).size,
      correlations: new Set(events.map(event => event.correlationId).filter(Boolean)).size,
      critical: events.filter(event => event.severity === 'critical').length,
    },
    schemaVersion: 'supervisor-timeline-v1',
  }
}
