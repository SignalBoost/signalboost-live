import test from 'node:test'
import assert from 'node:assert/strict'
import { createIncidentSource, createInMemoryDedupeStore, createInMemoryIncidentStore } from '../lib/supervisor/portable/incident-source.ts'
import { createAuthenticatedMonitoringIncidentSourceDefinition, createMonitoringIncidentSourceDefinition, monitoringAdapterIds, stagedMonitoringAdapters } from '../lib/supervisor/portable/monitoring-adapters.ts'

const receivedAt = '2026-07-27T12:00:00.000Z'
const fixtures: Record<(typeof monitoringAdapterIds)[number], unknown> = {
  datadog: { id: 'dd-1', title: 'API unhealthy', message: 'Five checks failed', severity: 'error', host: 'api.example.com', timestamp: receivedAt },
  pagerduty: { event: { id: 'pd-event', occurred_at: receivedAt, data: { id: 'pd-1', title: 'Checkout failure', urgency: 'high', service: { id: 'svc-1' } } } },
  'aws-cloudwatch-eventbridge': { id: 'aws-1', time: receivedAt, detail: { alarmName: 'High5xx', alarmArn: 'arn:alarm:High5xx', state: { value: 'ALARM', reason: '5xx threshold crossed' } } },
  'prometheus-alertmanager': { status: 'firing', alerts: [{ startsAt: receivedAt, fingerprint: 'prom-1', labels: { alertname: 'PodCrashLoop', severity: 'critical', pod: 'api-7d9' }, annotations: { description: 'Restart count exceeded threshold' } }] },
  splunk: { id: 'splunk-1', result: { timestamp: receivedAt, severity: 'warning', host: 'worker-1', message: 'Job failures exceeded threshold' } },
  'azure-monitor': { data: { essentials: { id: 'azure-1', title: 'AppUnavailable', severity: 'Sev1', timestamp: receivedAt, message: 'Availability test failed', resource: '/subscriptions/1/app' } } },
  'grafana-alerting': { status: 'firing', alerts: [{ startsAt: receivedAt, fingerprint: 'grafana-1', labels: { alertname: 'DatabaseLatency', severity: 'warning', service: 'postgres' }, annotations: { description: 'p95 latency is high' } }] },
  'google-cloud-operations': { incident: { incident_id: 'gcp-1', timestamp: receivedAt, severity: 'critical', title: 'Cloud Run errors', summary: 'Error rate exceeded threshold', resource: 'checkout-service' } },
}
const deliveryFor = (adapterId:(typeof monitoringAdapterIds)[number],headers:Record<string,string>={}) => ({headers,rawBody:JSON.stringify(fixtures[adapterId]),receivedAt})

test('popular monitoring adapters are staged and immutable', () => {
  assert.deepEqual(stagedMonitoringAdapters.map(item => item.adapterId), monitoringAdapterIds)
  assert.ok(stagedMonitoringAdapters.every(item => item.maturity === 'staged'))
  assert.ok(Object.isFrozen(stagedMonitoringAdapters))
})

for (const adapterId of monitoringAdapterIds) {
  test(`${adapterId} plugs into the universal incident source`, async () => {
    const definition = createMonitoringIncidentSourceDefinition(adapterId, { sourceId: `source-${adapterId}` })
    const source = createIncidentSource(definition, { dedupe: createInMemoryDedupeStore(), store: createInMemoryIncidentStore(), now: () => new Date(receivedAt) })
    const result = await source.receive(deliveryFor(adapterId))
    assert.equal(result.status, 'accepted')
    if (result.status !== 'accepted') return
    assert.equal(result.incident.source, 'webhook')
    assert.equal(result.incident.metadata.adapterId, adapterId)
    assert.equal(result.incident.metadata.adapterMaturity, 'staged')
    assert.ok(result.incident.evidence.length > 0)
  })
}

test('the universal source deduplicates repeated provider delivery', async () => {
  const source = createIncidentSource(createMonitoringIncidentSourceDefinition('datadog', { sourceId: 'datadog-main' }), { dedupe: createInMemoryDedupeStore(), store: createInMemoryIncidentStore(), now: () => new Date(receivedAt) })
  const delivery = deliveryFor('datadog')
  assert.equal((await source.receive(delivery)).status, 'accepted')
  assert.equal((await source.receive(delivery)).status, 'duplicate')
})

test('missing source identity fails closed', () => {
  assert.throws(() => createMonitoringIncidentSourceDefinition('datadog', { sourceId: '' }), /source_id_required/)
})

test('authenticated factory rejects a missing authenticator at wiring time', () => {
  assert.throws(() => createAuthenticatedMonitoringIncidentSourceDefinition('datadog', { sourceId: 'datadog-secure', authenticate: undefined as never }), /authenticator_required/)
})

test('native adapter authentication is bound before mapping', () => {
  let calls = 0
  const definition = createAuthenticatedMonitoringIncidentSourceDefinition('datadog', {
    sourceId: 'datadog-secure',
    authenticate(delivery, context) {
      calls += 1
      assert.equal(context.adapterId, 'datadog')
      assert.equal(context.vendor, 'Datadog')
      return delivery.headers.authorization === 'Bearer accepted'
        ? { ok: true }
        : { ok: false, reason: 'datadog_auth_failed' }
    },
  })

  assert.deepEqual(definition.authenticate?.(deliveryFor('datadog', { authorization: 'Bearer rejected' })), { ok: false, reason: 'datadog_auth_failed' })
  assert.deepEqual(definition.authenticate?.(deliveryFor('datadog', { authorization: 'Bearer accepted' })), { ok: true })
  assert.equal(calls, 2)
})

test('all staged adapters use the same authentication boundary', () => {
  for (const adapterId of monitoringAdapterIds) {
    const definition = createAuthenticatedMonitoringIncidentSourceDefinition(adapterId, {
      sourceId: `authenticated-${adapterId}`,
      authenticate: (delivery, context) => ({ ok: delivery.headers['x-monitoring-auth'] === context.adapterId, reason: 'monitoring_auth_failed' }),
    })
    assert.equal(definition.authenticate?.(deliveryFor(adapterId, { 'x-monitoring-auth': adapterId })).ok, true, adapterId)
  }
})
