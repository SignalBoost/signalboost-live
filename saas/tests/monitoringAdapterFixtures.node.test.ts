import test from 'node:test'
import assert from 'node:assert/strict'

import { createIncidentSource, createInMemoryDedupeStore } from '../lib/supervisor/portable/incident-source.ts'
import { createMonitoringIncidentSourceDefinition } from '../lib/supervisor/portable/monitoring-adapters.ts'
import type { MonitoringAdapterId } from '../lib/supervisor/portable/monitoring-adapters.ts'

const receivedAt = '2026-07-27T12:00:00.000Z'
const sourceFor = (adapterId: MonitoringAdapterId, dedupe?: ReturnType<typeof createInMemoryDedupeStore>) =>
  createIncidentSource(createMonitoringIncidentSourceDefinition(adapterId, { sourceId: `src-${adapterId}` }), {
    ...(dedupe ? { dedupe } : {}), now: () => new Date(receivedAt),
  })
const send = (adapterId: MonitoringAdapterId, body: unknown) =>
  sourceFor(adapterId).receive({ headers: {}, rawBody: JSON.stringify(body), receivedAt })

const azure = { schemaId: 'azureMonitorCommonAlertSchema', data: { essentials: {
  alertId: '/subscriptions/s/providers/Microsoft.AlertsManagement/alerts/abc', alertRule: 'CPU high on prod-web',
  severity: 'Sev1', monitorCondition: 'Fired', alertTargetIDs: ['/subscriptions/s/resourcegroups/rg/providers/microsoft.compute/virtualmachines/prod-web-01'],
  firedDateTime: receivedAt, description: 'CPU exceeded 90% for 15 minutes',
}, alertContext: {} } }
const pagerduty = { event: { id: '01FEV6P0KM', event_type: 'incident.triggered', occurred_at: receivedAt, data: {
  id: 'PIJ90N7', type: 'incident', title: 'Checkout returning 500s', urgency: 'high', status: 'triggered',
  incident_key: 'checkout-5xx', service: { id: 'PBAZLIU', summary: 'Checkout API' },
} } }
const alertmanager = { status: 'firing', alerts: [{ status: 'firing', startsAt: receivedAt, fingerprint: 'a1b2c3d4',
  labels: { alertname: 'PodCrashLoopBackOff', severity: 'critical', namespace: 'production', pod: 'api-7d9f' },
  annotations: { summary: 'Pod is crash looping', description: 'api-7d9f restarted 12 times in 10 minutes' },
}] }
const cloudwatch = { version: '0', id: 'c4c1c1c9', 'detail-type': 'CloudWatch Alarm State Change', source: 'aws.cloudwatch', time: receivedAt,
  resources: ['arn:aws:cloudwatch:us-east-1:1234:alarm:api-5xx'], detail: { alarmName: 'api-5xx',
  alarmArn: 'arn:aws:cloudwatch:us-east-1:1234:alarm:api-5xx', state: { value: 'ALARM', reason: 'Threshold Crossed' } } }
const datadog = { id: '7134832908', alert_type: 'error', title: '[Triggered] API error rate', body: 'API 5xx rate above 2%',
  aggregation_key: 'monitor-4471', monitor_id: '4471', host: 'api-prod-01', date: receivedAt }
const gcp = { incident: { incident_id: '0.abcd1234', resource: { type: 'cloud_run_revision', labels: { service_name: 'checkout', environment: 'production' } },
  resource_name: 'checkout-00042-abc', started_at: receivedAt, policy_name: 'Cloud Run error rate', state: 'OPEN', summary: 'Error rate for checkout is above 5%' } }

test('maps real Azure Common Alert Schema fields', async () => {
  const result = await send('azure-monitor', azure); assert.equal(result.status, 'accepted'); if (result.status !== 'accepted') return
  assert.equal(result.incident.errorMessage, 'CPU exceeded 90% for 15 minutes'); assert.equal(result.incident.severity, 'critical')
  assert.ok(result.incident.affectedResource?.includes('prod-web-01'))
})

test('maps PagerDuty high urgency as critical and keeps acknowledged active', async () => {
  const result = await send('pagerduty', pagerduty); assert.equal(result.status, 'accepted'); if (result.status !== 'accepted') return
  assert.equal(result.incident.severity, 'critical'); assert.equal(result.incident.metadata.intakeDedupeKey, 'checkout-5xx')
  const acknowledged = { event: { ...pagerduty.event, event_type: 'incident.acknowledged', data: { ...pagerduty.event.data, status: 'acknowledged' } } }
  assert.equal((await send('pagerduty', acknowledged)).status, 'accepted')
  const resolved = { event: { ...pagerduty.event, event_type: 'incident.resolved', data: { ...pagerduty.event.data, status: 'resolved' } } }
  assert.equal((await send('pagerduty', resolved)).status, 'ignored')
})

test('maps Alertmanager labels and annotations', async () => {
  const result = await send('prometheus-alertmanager', alertmanager); assert.equal(result.status, 'accepted'); if (result.status !== 'accepted') return
  assert.equal(result.incident.errorMessage, 'api-7d9f restarted 12 times in 10 minutes'); assert.equal(result.incident.environment, 'production')
  assert.equal(result.incident.affectedResource, 'api-7d9f'); assert.equal(result.incident.metadata.intakeDedupeKey, 'a1b2c3d4')
})

test('maps CloudWatch alarms and ignores OK transitions', async () => {
  const result = await send('aws-cloudwatch-eventbridge', cloudwatch); assert.equal(result.status, 'accepted'); if (result.status !== 'accepted') return
  assert.equal(result.incident.metadata.intakeDedupeKey, cloudwatch.detail.alarmArn)
  const cleared = { ...cloudwatch, detail: { ...cloudwatch.detail, state: { value: 'OK', reason: 'within threshold' } } }
  assert.equal((await send('aws-cloudwatch-eventbridge', cleared)).status, 'ignored')
})

test('maps Google Cloud incident fields', async () => {
  const result = await send('google-cloud-operations', gcp); assert.equal(result.status, 'accepted'); if (result.status !== 'accepted') return
  assert.equal(result.incident.errorMessage, 'Error rate for checkout is above 5%'); assert.equal(result.incident.metadata.intakeDedupeKey, '0.abcd1234')
})

test('deduplicates Datadog by stable monitor identity and keeps no-data active', async () => {
  const dedupe = createInMemoryDedupeStore(); const source = sourceFor('datadog', dedupe)
  const receive = (body: unknown) => source.receive({ headers: {}, rawBody: JSON.stringify(body), receivedAt })
  assert.equal((await receive(datadog)).status, 'accepted')
  assert.equal((await receive({ ...datadog, id: '7134832999' })).status, 'duplicate')
  const noKey = { ...datadog, aggregation_key: undefined }
  const dedupe2 = createInMemoryDedupeStore(); const source2 = sourceFor('datadog', dedupe2)
  const receive2 = (body: unknown) => source2.receive({ headers: {}, rawBody: JSON.stringify(body), receivedAt })
  assert.equal((await receive2({ ...noKey, id: 'evt-1' })).status, 'accepted')
  assert.equal((await receive2({ ...noKey, id: 'evt-2' })).status, 'duplicate')
  assert.equal((await send('datadog', { ...datadog, alert_type: 'warning', title: '[No Data] API heartbeat', body: 'No data received' })).status, 'accepted')
})

test('real payloads never fall back to generic placeholder messages', async () => {
  const cases: Array<[MonitoringAdapterId, unknown]> = [['azure-monitor', azure], ['pagerduty', pagerduty], ['prometheus-alertmanager', alertmanager],
    ['aws-cloudwatch-eventbridge', cloudwatch], ['datadog', datadog], ['google-cloud-operations', gcp]]
  for (const [adapterId, body] of cases) {
    const result = await send(adapterId, body); assert.equal(result.status, 'accepted', adapterId); if (result.status !== 'accepted') continue
    assert.ok(!/ monitoring alert$/.test(result.incident.errorMessage), `${adapterId} fell back to a placeholder`)
    assert.equal(result.incident.metadata.intakeStatus, 'staged'); assert.equal(result.incident.metadata.adapterId, adapterId)
  }
})
