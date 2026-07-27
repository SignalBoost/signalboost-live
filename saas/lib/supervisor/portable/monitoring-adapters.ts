import type { IncidentMapping, IncidentSourceDefinition, RawIncidentDelivery } from './incident-source.ts'

export const monitoringAdapterIds = [
  'datadog',
  'pagerduty',
  'aws-cloudwatch-eventbridge',
  'prometheus-alertmanager',
  'splunk',
  'azure-monitor',
  'grafana-alerting',
  'google-cloud-operations',
] as const

export type MonitoringAdapterId = (typeof monitoringAdapterIds)[number]
export type MonitoringAdapterMaturity = 'staged' | 'certified' | 'deprecated'

export interface MonitoringAdapterDescriptor {
  readonly adapterId: MonitoringAdapterId
  readonly displayName: string
  readonly maturity: MonitoringAdapterMaturity
  readonly transport: 'webhook'
  readonly authentication: readonly string[]
  readonly schemaVersion: 'monitoring-adapter-v1'
}

export interface MonitoringAdapterContext {
  readonly sourceId: string
  readonly defaultEnvironment?: string
}

const descriptors: Record<MonitoringAdapterId, MonitoringAdapterDescriptor> = {
  datadog: descriptor('datadog', 'Datadog', ['shared-secret', 'source-ip-policy']),
  pagerduty: descriptor('pagerduty', 'PagerDuty', ['webhook-signature']),
  'aws-cloudwatch-eventbridge': descriptor('aws-cloudwatch-eventbridge', 'AWS CloudWatch / EventBridge', ['aws-sns-signature', 'api-gateway-authorizer']),
  'prometheus-alertmanager': descriptor('prometheus-alertmanager', 'Prometheus Alertmanager', ['shared-secret', 'reverse-proxy-auth']),
  splunk: descriptor('splunk', 'Splunk', ['hec-token', 'shared-secret']),
  'azure-monitor': descriptor('azure-monitor', 'Azure Monitor', ['entra-id', 'shared-secret']),
  'grafana-alerting': descriptor('grafana-alerting', 'Grafana Alerting', ['basic-auth', 'shared-secret']),
  'google-cloud-operations': descriptor('google-cloud-operations', 'Google Cloud Operations', ['oidc', 'shared-secret']),
}

export const stagedMonitoringAdapters = Object.freeze(monitoringAdapterIds.map(id => descriptors[id]))

function descriptor(adapterId: MonitoringAdapterId, displayName: string, authentication: readonly string[]): MonitoringAdapterDescriptor {
  return Object.freeze({ adapterId, displayName, maturity: 'staged', transport: 'webhook', authentication: Object.freeze([...authentication]), schemaVersion: 'monitoring-adapter-v1' })
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '')
}

function string(value: unknown, fallback: string): string {
  return String(value ?? fallback).trim() || fallback
}

function base(adapterId: MonitoringAdapterId, provider: string, body: Record<string, unknown>, delivery: RawIncidentDelivery): IncidentMapping {
  return {
    provider,
    errorMessage: string(first(body.message, body.summary, body.title, body.status), `${adapterId} monitoring alert`),
    environment: string(first(body.environment, body.env, body.target), 'production'),
    severity: string(first(body.severity, body.priority, body.status), 'warning'),
    detectedAt: string(first(body.detectedAt, body.timestamp, body.time, body.created_at, body.createdAt), delivery.receivedAt ?? new Date().toISOString()),
    affectedResource: string(first(body.resource, body.resourceId, body.host, body.hostname, body.service), 'unknown-resource'),
    errorCode: string(first(body.eventId, body.id, body.incident_id, body.alert_id), `${adapterId}-alert`),
    dedupeKey: string(first(body.dedupeKey, body.dedup_key, body.fingerprint, body.id), `${adapterId}:${string(first(body.resource, body.host, body.service), 'unknown-resource')}`),
    evidence: [{ type: 'monitoring-alert', summary: string(first(body.message, body.summary, body.title), `${adapterId} monitoring alert`) }],
    metadata: { adapterId, adapterMaturity: 'staged' },
  }
}

function mapPayload(adapterId: MonitoringAdapterId, raw: unknown, delivery: RawIncidentDelivery): IncidentMapping {
  const body = obj(raw)
  if (adapterId === 'pagerduty') {
    const event = obj(first(body.event, body))
    const data = obj(first(event.data, body.data))
    return { ...base(adapterId, 'pagerduty', { ...body, ...event, ...data }, delivery), affectedResource: string(first(obj(data.service).id, data.service_id, data.incident_key), 'unknown-resource'), dedupeKey: string(first(data.id, event.id, data.incident_key), 'pagerduty-alert') }
  }
  if (adapterId === 'aws-cloudwatch-eventbridge') {
    const detail = obj(body.detail)
    const state = obj(detail.state)
    return { ...base(adapterId, 'aws', { ...body, ...detail, message: first(state.reason, detail.message), severity: first(state.value, detail.severity), resource: first(detail.alarmArn, body.resources), id: first(body.id, detail.alarmName) }, delivery) }
  }
  if (adapterId === 'prometheus-alertmanager' || adapterId === 'grafana-alerting') {
    const alert = obj(Array.isArray(body.alerts) ? body.alerts[0] : undefined)
    const labels = obj(alert.labels)
    const annotations = obj(alert.annotations)
    return { ...base(adapterId, adapterId === 'grafana-alerting' ? 'grafana' : 'prometheus', { ...body, ...alert, ...labels, message: first(annotations.description, annotations.summary, body.message), title: first(annotations.summary, labels.alertname, body.title), resource: first(labels.instance, labels.pod, labels.service, labels.job), id: first(alert.fingerprint, labels.alertname) }, delivery) }
  }
  if (adapterId === 'splunk') return base(adapterId, 'splunk', { ...body, ...obj(body.result) }, delivery)
  if (adapterId === 'azure-monitor') return base(adapterId, 'azure', { ...body, ...obj(first(obj(body.data).essentials, body.essentials)) }, delivery)
  if (adapterId === 'google-cloud-operations') return base(adapterId, 'gcp', { ...body, ...obj(first(body.incident, body)) }, delivery)
  return base(adapterId, 'datadog', body, delivery)
}

export function createMonitoringIncidentSourceDefinition(adapterId: MonitoringAdapterId, context: MonitoringAdapterContext): IncidentSourceDefinition {
  if (!context.sourceId.trim()) throw new Error('monitoring_adapter_source_id_required')
  return Object.freeze({
    sourceId: context.sourceId,
    vendor: adapterId,
    status: 'staged',
    map(body, delivery) {
      const mapped = mapPayload(adapterId, body, delivery)
      return { ...mapped, environment: mapped.environment ?? context.defaultEnvironment ?? 'production' }
    },
  })
}
