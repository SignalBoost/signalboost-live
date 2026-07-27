import type { IncidentSourceDefinition } from '../incident-source.ts'
import { first, isNonIncidentState, mapping, object, optionalString } from './shared.ts'

export function createPagerDutyDefinition(sourceId: string): IncidentSourceDefinition {
  return { sourceId, vendor: 'PagerDuty', status: 'staged', map(body, delivery) {
    const root = object(body)
    const event = object(first(root.event, root))
    const data = object(first(event.data, root.data))
    if (isNonIncidentState(event.event_type, data.status, data.incident_status)) return null
    const urgency = optionalString(first(data.urgency, data.priority, data.severity))
    const severity = urgency && /^(high|urgent|major)$/i.test(urgency) ? 'critical' : urgency
    return mapping({ provider: 'pagerduty', delivery, message: first(data.description, data.summary, data.title), severity, environment: first(data.environment, root.environment), detectedAt: first(event.occurred_at, data.created_at), errorCode: first(data.id, event.id), affectedResource: first(object(data.service).id, data.service_id, data.incident_key), dedupeKey: first(data.dedup_key, data.incident_key, data.id), metadata: { adapterId: 'pagerduty', adapterMaturity: 'staged' } })
  } }
}
