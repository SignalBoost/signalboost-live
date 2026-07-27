// saas/lib/supervisor/portable/monitoring-adapters/grafana-alerting.ts
//
// Grafana Alerting BATCHES. A single webhook routinely carries many alerts in one
// `alerts` array — that is its normal operating mode, not an edge case. This adapter
// previously mapped alerts[0] and discarded the rest, which is silent alert loss that
// looks exactly like a working integration.
//
// It now returns one mapping per firing alert. Resolved entries inside a batch are
// skipped rather than dropping the whole delivery, because Alertmanager mixes firing
// and resolved alerts in the same request.

import type { IncidentMapping, IncidentSourceDefinition } from '../incident-source.ts'
import { first, isNonIncidentState, mapping, object } from './shared.ts'

export function createGrafanaDefinition(sourceId: string): IncidentSourceDefinition {
  return {
    sourceId,
    vendor: 'Grafana Alerting',
    status: 'staged',
    map(body, delivery) {
      const root = object(body)
      const alerts = Array.isArray(root.alerts) ? root.alerts : []

      // No alerts array at all — an older or hand-rolled sender. Treat the envelope
      // itself as one alert rather than refusing it.
      if (alerts.length === 0) {
        if (isNonIncidentState(root.status)) return null
        const labels = object(root.labels)
        const annotations = object(root.annotations)
        return mapping({
          provider: String(first(labels.provider, labels.cloud, 'grafana')),
          delivery,
          message: first(annotations.description, annotations.summary, root.message, root.title, labels.alertname),
          severity: first(labels.severity, labels.priority),
          environment: first(labels.environment, labels.env, labels.namespace),
          detectedAt: first(root.startsAt),
          errorCode: first(labels.alertname),
          affectedResource: first(labels.instance, labels.service, labels.job),
          dedupeKey: first(root.fingerprint, labels.alertname),
          metadata: { adapterId: 'grafana-alerting', adapterMaturity: 'staged' },
        })
      }

      const mapped: IncidentMapping[] = []
      for (const entry of alerts) {
        const alert = object(entry)
        const labels = object(alert.labels)
        const annotations = object(alert.annotations)
        // Per-alert, not per-delivery: a resolved entry beside firing ones must not
        // discard its neighbours.
        if (isNonIncidentState(alert.status)) continue
        mapped.push(mapping({
          provider: String(first(labels.provider, labels.cloud, 'grafana')),
          delivery,
          message: first(annotations.description, annotations.summary, root.message, root.title, labels.alertname),
          severity: first(labels.severity, labels.priority),
          environment: first(labels.environment, labels.env, labels.namespace),
          detectedAt: first(alert.startsAt, root.startsAt),
          errorCode: first(labels.alertname),
          affectedResource: first(labels.instance, labels.service, labels.job),
          // Alertmanager's own per-alert fingerprint is the correct identity; falling
          // back to alertname alone would collapse distinct instances of one rule.
          dedupeKey: first(alert.fingerprint, labels.instance ? `${labels.alertname}:${labels.instance}` : labels.alertname),
          metadata: { adapterId: 'grafana-alerting', adapterMaturity: 'staged' },
        }))
      }

      // Every alert in the batch had cleared. That is a resolution notice, not a
      // failure — ignored, not rejected.
      return mapped.length > 0 ? mapped : null
    },
  }
}
