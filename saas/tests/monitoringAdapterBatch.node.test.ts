// saas/tests/monitoringAdapterBatch.node.test.ts
//
// Batched deliveries.
//
// Alertmanager and Grafana send many alerts in one webhook as their normal mode of
// operation. Mapping only the first is silent alert loss — the integration looks
// healthy, the dashboard shows incidents arriving, and most of them were thrown away.
//
// These tests assert the count. Anything that maps a 3-alert batch to fewer than 3
// incidents fails here, whatever else it gets right.

import test from 'node:test'
import assert from 'node:assert/strict'

import { createIncidentSource, createInMemoryDedupeStore, INTAKE_LIMITS } from '../lib/supervisor/portable/incident-source.ts'
import { createIncidentRuntime, createInMemoryIncidentRecordStore } from '../lib/supervisor/portable/incident-runtime.ts'
import { createMonitoringIncidentSourceDefinition } from '../lib/supervisor/portable/monitoring-adapters.ts'

const at = '2026-07-27T12:00:00.000Z'

const alert = (name: string, instance: string, status = 'firing', severity = 'critical') => ({
  status,
  startsAt: at,
  fingerprint: `fp-${name}-${instance}`,
  labels: { alertname: name, severity, instance, namespace: 'production' },
  annotations: { description: `${name} on ${instance}` },
})

const sourceFor = (adapterId: 'prometheus-alertmanager' | 'grafana-alerting', dedupe = createInMemoryDedupeStore()) =>
  createIncidentSource(createMonitoringIncidentSourceDefinition(adapterId, { sourceId: `s-${adapterId}` }), { dedupe, now: () => new Date(at) })

const deliver = (body: unknown) => ({ headers: {}, rawBody: JSON.stringify(body), receivedAt: at })

for (const adapterId of ['prometheus-alertmanager', 'grafana-alerting'] as const) {
  test(`${adapterId}: three firing alerts in one delivery become three incidents`, async () => {
    const result = await sourceFor(adapterId).receive(deliver({
      status: 'firing',
      alerts: [alert('PodCrashLoop', 'api-1'), alert('PodCrashLoop', 'api-2'), alert('DiskPressure', 'node-7')],
    }))

    assert.equal(result.status, 'batch')
    if (result.status !== 'batch') return
    assert.equal(result.outcomes.length, 3)
    assert.ok(result.outcomes.every(o => o.status === 'accepted'), 'every firing alert becomes its own incident')

    const messages = result.outcomes.map(o => (o.status === 'accepted' ? o.incident.errorMessage : ''))
    assert.ok(messages.includes('PodCrashLoop on api-2'), 'the second alert must not be discarded')
    assert.ok(messages.includes('DiskPressure on node-7'), 'the third alert must not be discarded')
  })

  test(`${adapterId}: two instances of the SAME rule are separate incidents`, async () => {
    // The failure this guards against is over-collapsing: if the dedupe key were the
    // rule name alone, one host recovering would look like all of them recovering.
    const result = await sourceFor(adapterId).receive(deliver({
      status: 'firing',
      alerts: [alert('HighLatency', 'web-1'), alert('HighLatency', 'web-2')],
    }))

    assert.equal(result.status, 'batch')
    if (result.status !== 'batch') return
    const fingerprints = new Set(result.outcomes.map(o => (o.status === 'accepted' ? o.fingerprint : '')))
    assert.equal(fingerprints.size, 2, 'same rule, different instance, different incident')
  })

  test(`${adapterId}: resolved entries are skipped without discarding their neighbours`, async () => {
    // Alertmanager mixes firing and resolved alerts in one request. Previously a
    // resolved alert in first position dropped the entire delivery.
    const result = await sourceFor(adapterId).receive(deliver({
      status: 'firing',
      alerts: [alert('Cleared', 'api-1', 'resolved'), alert('StillBroken', 'api-2'), alert('AlsoCleared', 'api-3', 'resolved')],
    }))

    assert.equal(result.status, 'accepted', 'one survivor unwraps to a single outcome')
    assert.equal(result.status === 'accepted' && result.incident.errorMessage, 'StillBroken on api-2')
  })

  test(`${adapterId}: a delivery where everything cleared is ignored, not rejected`, async () => {
    const result = await sourceFor(adapterId).receive(deliver({
      status: 'resolved',
      alerts: [alert('A', 'x', 'resolved'), alert('B', 'y', 'resolved')],
    }))
    assert.equal(result.status, 'ignored')
  })

  test(`${adapterId}: a single-alert delivery still works exactly as before`, async () => {
    // A batch of one unwraps to a plain accepted outcome, so every caller written
    // before batching existed keeps working when a batching vendor sends one alert.
    const result = await sourceFor(adapterId).receive(deliver({ status: 'firing', alerts: [alert('OnlyOne', 'host-1')] }))
    assert.equal(result.status, 'accepted')
  })

  test(`${adapterId}: a repeated batch deduplicates alert by alert`, async () => {
    const dedupe = createInMemoryDedupeStore()
    const source = sourceFor(adapterId, dedupe)
    const payload = deliver({ status: 'firing', alerts: [alert('A', 'x'), alert('B', 'y')] })

    const first = await source.receive(payload)
    const second = await source.receive(payload)

    assert.equal(first.status === 'batch' && first.outcomes.every(o => o.status === 'accepted'), true)
    assert.equal(second.status, 'batch')
    if (second.status !== 'batch') return
    assert.ok(second.outcomes.every(o => o.status === 'duplicate'), 'the whole repeated batch is duplicate')
  })
}

test('an oversized batch is truncated and the truncation is REPORTED', async () => {
  // A silently dropped alert is the exact failure this change exists to remove, so
  // hitting the bound must produce a visible rejection rather than a quiet cut.
  const alerts = Array.from({ length: INTAKE_LIMITS.maxBatchSize + 5 }, (_, i) => alert('Flood', `host-${i}`))
  const result = await sourceFor('prometheus-alertmanager').receive(deliver({ status: 'firing', alerts }))

  assert.equal(result.status, 'batch')
  if (result.status !== 'batch') return
  assert.equal(result.outcomes.length, INTAKE_LIMITS.maxBatchSize + 1, 'the cap plus one truncation notice')
  const truncation = result.outcomes[result.outcomes.length - 1]
  assert.equal(truncation.status, 'rejected')
  assert.ok(truncation.status === 'rejected' && truncation.reason.startsWith('batch_truncated'))
})

test('END TO END: the runtime runs the handler once per alert in a batch', async () => {
  const handled: string[] = []
  const records = createInMemoryIncidentRecordStore()
  const runtime = createIncidentRuntime({
    sources: [createIncidentSource(
      createMonitoringIncidentSourceDefinition('prometheus-alertmanager', { sourceId: 'alertmanager' }),
      { dedupe: createInMemoryDedupeStore(), now: () => new Date(at) },
    )],
    handler: incident => { handled.push(incident.errorMessage); return { status: 'completed', reason: 'verified' } },
    records,
    now: () => new Date(at),
  })

  const result = await runtime.deliver('alertmanager', deliver({
    status: 'firing',
    alerts: [alert('One', 'a'), alert('Two', 'b'), alert('Three', 'c')],
  }))

  assert.equal(result.status, 'batch')
  if (result.status !== 'batch') return
  assert.equal(result.results.length, 3)
  assert.equal(handled.length, 3, 'every alert reaches the orchestrator, not just the first')
  assert.equal(records.all().length, 3, 'every alert is durably recorded')
  assert.equal(runtime.health().handled, 3)
})

test('END TO END: one failing alert in a batch does not stop the others', async () => {
  // Independence matters: a batch is not a transaction. The second alert throwing
  // must not prevent the third from being diagnosed.
  const handled: string[] = []
  const runtime = createIncidentRuntime({
    sources: [createIncidentSource(
      createMonitoringIncidentSourceDefinition('prometheus-alertmanager', { sourceId: 'alertmanager' }),
      { dedupe: createInMemoryDedupeStore(), now: () => new Date(at) },
    )],
    handler: incident => {
      handled.push(incident.errorMessage)
      if (incident.errorMessage.includes('Two')) throw new Error('thinker unavailable')
      return { status: 'completed', reason: 'verified' }
    },
    records: createInMemoryIncidentRecordStore(),
    now: () => new Date(at),
  })

  const result = await runtime.deliver('alertmanager', deliver({
    status: 'firing',
    alerts: [alert('One', 'a'), alert('Two', 'b'), alert('Three', 'c')],
  }))

  assert.equal(result.status, 'batch')
  if (result.status !== 'batch') return
  assert.equal(handled.length, 3, 'the third alert still ran')
  const statuses = result.results.map(r => (r.status === 'handled' ? r.record.status : r.status))
  assert.deepEqual(statuses, ['completed', 'handler_error', 'completed'])
})
