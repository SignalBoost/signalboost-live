import type { IncidentSourceDefinition } from '../incident-source.ts'
import { first, isNonIncidentState, mapping, object } from './shared.ts'

export function createDatadogDefinition(sourceId: string): IncidentSourceDefinition {
  return { sourceId, vendor: 'Datadog', status: 'staged', map(body, delivery) {
    const value = object(body)
    if (isNonIncidentState(value.alert_type, value.status, value.event_type)) return null
    return mapping({ provider: String(first(value.provider, value.source, 'datadog')), delivery, message: first(value.body, value.text, value.message, value.title), severity: first(value.alert_type, value.priority, value.status), environment: first(value.environment, value.env), detectedAt: first(value.date, value.timestamp, value.last_updated), errorCode: first(value.alert_id, value.monitor_id), affectedResource: first(value.host, value.hostname, value.monitor_id), dedupeKey: first(value.aggregation_key, value.monitor_id, value.alert_id), metadata: { adapterId: 'datadog', adapterMaturity: 'staged' } })
  } }
}
