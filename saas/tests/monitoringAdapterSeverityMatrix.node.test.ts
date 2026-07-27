// saas/tests/monitoringAdapterSeverityMatrix.node.test.ts
//
// One severity vocabulary, checked across EVERY adapter.
//
// This file exists because of a specific near-miss. `high` was missing from the
// shared severity table, so every vendor that uses the high/medium/low scale had its
// most urgent alert downgraded to a warning. The gap was then fixed inside ONE
// adapter (pagerduty.ts), which made the PagerDuty test green while Grafana,
// Alertmanager, Splunk and Google Cloud all kept downgrading — with a fully green
// suite, because only PagerDuty was covered for it.
//
// A per-vendor test can only ever prove a per-vendor fix. So this suite drives the
// SAME severity word through EVERY adapter and asserts they agree. If someone patches
// one adapter instead of the shared table, this fails immediately.

import test from 'node:test'
import assert from 'node:assert/strict'

import { createIncidentSource, normalizeSeverity } from '../lib/supervisor/portable/incident-source.ts'
import { createMonitoringIncidentSourceDefinition, monitoringAdapterIds } from '../lib/supervisor/portable/monitoring-adapters.ts'
import type { MonitoringAdapterId } from '../lib/supervisor/portable/monitoring-adapters.ts'

const at = '2026-07-27T12:00:00.000Z'

const send = async (adapterId: MonitoringAdapterId, body: unknown) => {
  const source = createIncidentSource(createMonitoringIncidentSourceDefinition(adapterId, { sourceId: `s-${adapterId}` }), { now: () => new Date(at) })
  return source.receive({ headers: {}, rawBody: JSON.stringify(body), receivedAt: at })
}

// A firing payload per vendor whose severity field is parameterised, so the same word
// can be pushed through all eight and the answers compared.
const payloadWith = (adapterId: MonitoringAdapterId, severity: string): unknown => {
  switch (adapterId) {
    case 'datadog':
      return { id: 'e1', alert_type: severity, body: 'error rate above threshold', aggregation_key: 'agg-1', monitor_id: 'm1', host: 'h1', date: at }
    case 'pagerduty':
      return { event: { id: 'e1', event_type: 'incident.triggered', occurred_at: at, data: { id: 'PD1', title: 'checkout failing', urgency: severity, status: 'triggered', incident_key: 'k1' } } }
    case 'aws-cloudwatch-eventbridge':
      return { id: 'a1', time: at, resources: ['arn:alarm:x'], detail: { alarmName: 'x', alarmArn: 'arn:alarm:x', severity, state: { value: 'ALARM', reason: 'threshold crossed' } } }
    case 'prometheus-alertmanager':
    case 'grafana-alerting':
      return { status: 'firing', alerts: [{ status: 'firing', startsAt: at, fingerprint: 'f1', labels: { alertname: 'A', severity, instance: 'i1' }, annotations: { description: 'latency is high' } }] }
    case 'splunk':
      return { search_name: 'S1', result: { severity, host: 'h1', message: 'job failures exceeded threshold', source: 'src' } }
    case 'azure-monitor':
      return { data: { essentials: { alertId: 'az1', alertRule: 'R', severity, monitorCondition: 'Fired', firedDateTime: at, description: 'availability failed', alertTargetIDs: ['/sub/x'] } } }
    case 'google-cloud-operations':
      return { incident: { incident_id: 'g1', severity, summary: 'error rate above 5%', state: 'OPEN', started_at: at, resource: { type: 'cloud_run_revision', labels: {} }, policy_name: 'P' } }
    default:
      throw new Error(`no payload defined for ${adapterId}`)
  }
}

test('the shared table maps every common severity vocabulary', () => {
  for (const word of ['critical', 'CRITICAL', 'fatal', 'emergency', 'sev-1', 'Sev0', 'P1', 'error', 'firing', 'high', 'urgent', 'major', 'Triggered']) {
    assert.equal(normalizeSeverity(word), 'critical', word)
  }
  for (const word of ['warning', 'warn', 'minor', 'degraded', 'sev-2', 'P3', 'medium', 'moderate', 'no data']) {
    assert.equal(normalizeSeverity(word), 'warning', word)
  }
  for (const word of ['info', 'notice', 'low', 'none', 'debug', 'P5', 'Sev4']) {
    assert.equal(normalizeSeverity(word), 'info', word)
  }
})

test('"high" is critical for EVERY adapter, not just the one that was patched', async () => {
  // The regression guard. A fix applied inside a single adapter fails here.
  const results: Array<[string, string]> = []
  for (const adapterId of monitoringAdapterIds) {
    const outcome = await send(adapterId, payloadWith(adapterId, 'high'))
    assert.equal(outcome.status, 'accepted', `${adapterId} rejected a high-severity payload`)
    if (outcome.status !== 'accepted') continue
    results.push([adapterId, outcome.incident.severity])
  }
  const downgraded = results.filter(([, severity]) => severity !== 'critical')
  assert.deepEqual(downgraded, [], `these adapters downgraded a high-severity alert: ${downgraded.map(([id, s]) => `${id}=${s}`).join(', ')}`)
  assert.equal(results.length, monitoringAdapterIds.length, 'every adapter must be covered')
})

test('every adapter agrees on the same severity word', async () => {
  // Not just `high` — any word the shared table knows must resolve identically
  // whichever vendor delivered it. Divergence means someone mapped locally.
  for (const [word, expected] of [['critical', 'critical'], ['warning', 'warning'], ['low', 'info']] as const) {
    const seen = new Set<string>()
    for (const adapterId of monitoringAdapterIds) {
      const outcome = await send(adapterId, payloadWith(adapterId, word))
      if (outcome.status !== 'accepted') continue
      seen.add(`${adapterId}:${outcome.incident.severity}`)
      assert.equal(outcome.incident.severity, expected, `${adapterId} disagreed on "${word}"`)
    }
    assert.equal(seen.size, monitoringAdapterIds.length, `every adapter should have produced a severity for "${word}"`)
  }
})

test('an unknown severity word lands on a defined value rather than throwing', async () => {
  for (const adapterId of monitoringAdapterIds) {
    const outcome = await send(adapterId, payloadWith(adapterId, 'chartreuse'))
    assert.equal(outcome.status, 'accepted', adapterId)
    if (outcome.status !== 'accepted') continue
    assert.ok(['info', 'warning', 'critical'].includes(outcome.incident.severity), adapterId)
  }
})
