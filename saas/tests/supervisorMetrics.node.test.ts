import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSupervisorMetrics,
  createSupervisorTimeline,
  type SupervisorTimelineSource,
} from '../lib/supervisor/index.ts'

const source = (overrides: Partial<SupervisorTimelineSource> = {}): SupervisorTimelineSource => ({
  source: 'supervisor_events',
  sourceId: 'event-1',
  occurredAt: '2026-07-18T11:00:00.000Z',
  kind: 'incident',
  action: 'incident_detected',
  incidentId: 'incident-1',
  correlationId: 'correlation-1',
  severity: 'info',
  ...overrides,
})

const metricsFor = (sources: SupervisorTimelineSource[], window: '1h' | '24h' | '7d' | '30d' = '24h') => {
  const timeline = createSupervisorTimeline(sources)
  return createSupervisorMetrics(timeline.events, { window, now: '2026-07-18T12:00:00.000Z' })
}

test('filters events to the selected metrics window', () => {
  const metrics = metricsFor([
    source(),
    source({ sourceId: 'old', occurredAt: '2026-07-17T10:00:00.000Z' }),
  ], '24h')

  assert.equal(metrics.totals.events, 1)
  assert.equal(metrics.windowStart, '2026-07-17T12:00:00.000Z')
  assert.equal(metrics.schemaVersion, 'supervisor-metrics-v1')
})

test('computes incident detection and repair latency', () => {
  const metrics = metricsFor([
    source({ sourceId: 'observed', occurredAt: '2026-07-18T10:00:00.000Z', kind: 'observation', action: 'observed' }),
    source({ sourceId: 'detected', occurredAt: '2026-07-18T10:05:00.000Z', action: 'incident_detected' }),
    source({ sourceId: 'repaired', occurredAt: '2026-07-18T10:20:00.000Z', action: 'incident_repaired' }),
  ])

  assert.equal(metrics.latencyMs.meanTimeToDetect, 5 * 60 * 1000)
  assert.equal(metrics.latencyMs.meanTimeToRepair, 15 * 60 * 1000)
})

test('computes approval latency using correlation identity', () => {
  const metrics = metricsFor([
    source({ sourceId: 'approval-1', occurredAt: '2026-07-18T10:00:00.000Z', kind: 'approval', action: 'approval_requested', incidentId: undefined }),
    source({ sourceId: 'approval-2', occurredAt: '2026-07-18T10:03:00.000Z', kind: 'approval', action: 'approval_approved', incidentId: undefined }),
  ])

  assert.equal(metrics.totals.approvalsRequested, 1)
  assert.equal(metrics.totals.approvalsCompleted, 1)
  assert.equal(metrics.latencyMs.meanApprovalLatency, 3 * 60 * 1000)
})

test('reports provider reliability and operational totals', () => {
  const metrics = metricsFor([
    source({ sourceId: 'provider-ok', kind: 'observation', action: 'completed', provider: 'github' }),
    source({ sourceId: 'provider-fail', kind: 'observation', action: 'failed', provider: 'github', severity: 'critical' }),
    source({ sourceId: 'queue', kind: 'work_item', action: 'work_item_completed', metadata: { retryCount: 2 } }),
    source({ sourceId: 'kill', kind: 'kill_switch', action: 'kill_switch_activated' }),
  ])

  assert.deepEqual(metrics.providers, [{ provider: 'github', events: 2, successes: 1, failures: 1, successRate: 50 }])
  assert.equal(metrics.totals.queueCompleted, 1)
  assert.equal(metrics.totals.retries, 2)
  assert.equal(metrics.totals.killSwitchActivations, 1)
  assert.equal(metrics.totals.criticalEvents, 1)
})

test('returns deterministic kind and severity summaries', () => {
  const metrics = metricsFor([
    source({ sourceId: 'health', kind: 'health', action: 'healthy' }),
    source({ sourceId: 'incident', severity: 'warning' }),
  ])

  assert.deepEqual(metrics.eventsByKind, { health: 1, incident: 1 })
  assert.deepEqual(metrics.eventsBySeverity, { info: 1, warning: 1 })
})

test('rejects an invalid analytics clock', () => {
  assert.throws(() => createSupervisorMetrics([], { now: 'not-a-date' }), /valid now timestamp/)
})
