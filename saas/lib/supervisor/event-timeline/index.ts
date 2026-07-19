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

export interface SupervisorTimelineOptions {
  incidentId?: string
  correlationId?: string
  provider?: string
  kind?: SupervisorEventKind
  severity?: SupervisorEventSeverity
  actorType?: SupervisorTimelineEvent['actorType']
  from?: string
  to?: string
  limit?: number
}

const forbidden = /(authorization|bearer\s+[a-z0-9._-]+|cookie|password|secret|token|api[_-]?key|credential|session[_-]?id|localstorage|sessionstorage)/i
const primitiveMetadata = (value: Record<string, unknown> = {}) => Object.fromEntries(
  Object.entries(value)
    .filter(([key, item]) => !forbidden.test(key) && (item === null || ['string', 'number', 'boolean'].includes(typeof item)))
    .map(([key, item]) => [key, typeof item === 'string' && forbidden.test(item) ? '[redacted]' : item])
    .sort(([a], [b]) => a.localeCompare(b)),
) as Record<string, string | number | boolean | null>

const validTime = (value?: string) => Boolean(value && Number.isFinite(Date.parse(value)))
const boundedLimit = (value?: number) => Math.min(250, Math.max(0, Math.floor(value ?? 200)))

export function createSupervisorTimeline(
  sources: SupervisorTimelineSource[],
  options: SupervisorTimelineOptions = {},
): SupervisorTimeline {
  const deduplicated = new Map<string, SupervisorTimelineEvent>()
  const from = validTime(options.from) ? Date.parse(options.from!) : Number.NEGATIVE_INFINITY
  const to = validTime(options.to) ? Date.parse(options.to!) : Number.POSITIVE_INFINITY
  if (from > to) throw new Error('invalid_timeline_window')

  for (const source of sources.slice(0, 10_000)) {
    if (!source.source || !source.sourceId || !source.action || !validTime(source.occurredAt)) continue
    const occurredAt = Date.parse(source.occurredAt)
    if (occurredAt < from || occurredAt > to) continue
    if (options.incidentId && source.incidentId !== options.incidentId) continue
    if (options.correlationId && source.correlationId !== options.correlationId) continue
    if (options.provider && source.provider !== options.provider) continue
    if (options.kind && source.kind !== options.kind) continue
    if (options.severity && (source.severity ?? 'info') !== options.severity) continue
    if (options.actorType && (source.actorType ?? 'system') !== options.actorType) continue

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

  const events = [...deduplicated.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.eventId.localeCompare(b.eventId)).slice(0, boundedLimit(options.limit))
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
