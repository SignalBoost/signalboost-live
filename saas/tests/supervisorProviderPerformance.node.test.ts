import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderPerformanceDashboard, type SupervisorMetrics } from '../lib/supervisor/index.ts'

const metrics = (providers: SupervisorMetrics['providers']): SupervisorMetrics => ({
  generatedAt: '2026-07-18T21:00:00.000Z',
  window: '24h',
  windowStart: '2026-07-17T21:00:00.000Z',
  windowEnd: '2026-07-18T21:00:00.000Z',
  totals: { events: 0, incidents: 0, criticalEvents: 0, queueCompleted: 0, retries: 0, approvalsRequested: 0, approvalsCompleted: 0, killSwitchActivations: 0 },
  latencyMs: { meanTimeToDetect: null, meanTimeToRepair: null, meanApprovalLatency: null },
  providers,
  eventsByKind: {},
  eventsBySeverity: {},
  schemaVersion: 'supervisor-metrics-v1',
})

test('classifies providers using measured attempt thresholds', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'healthy', events: 20, successes: 19, failures: 1, successRate: 95 },
    { provider: 'warning', events: 10, successes: 8, failures: 2, successRate: 80 },
    { provider: 'critical', events: 10, successes: 7, failures: 3, successRate: 70 },
    { provider: 'unknown', events: 2, successes: 1, failures: 0, successRate: 100 },
  ]))
  assert.deepEqual(dashboard.providers.map(provider => provider.state), ['critical', 'warning', 'unknown', 'healthy'])
})

test('ranks the providers needing attention first', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'zeta', events: 10, successes: 6, failures: 4, successRate: 60 },
    { provider: 'alpha', events: 10, successes: 5, failures: 5, successRate: 50 },
  ]))
  assert.equal(dashboard.providers[0].provider, 'alpha')
  assert.deepEqual(dashboard.providers.map(provider => provider.rank), [1, 2])
})

test('calculates aggregate provider reliability', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'github', events: 12, successes: 8, failures: 2, successRate: 80 },
    { provider: 'vercel', events: 12, successes: 9, failures: 1, successRate: 90 },
  ]))
  assert.deepEqual(dashboard.summary, {
    providers: 2, healthy: 0, warning: 2, critical: 0, unknown: 0,
    totalAttempts: 20, totalSuccesses: 17, totalFailures: 3, overallSuccessRate: 85,
  })
})

test('marks insufficient samples unknown', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'github', events: 2, successes: 1, failures: 1, successRate: 50 },
  ]), { minimumAttempts: 3 })
  assert.equal(dashboard.providers[0].state, 'unknown')
})

test('applies a bounded provider limit', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'a', events: 3, successes: 3, failures: 0, successRate: 100 },
    { provider: 'b', events: 3, successes: 3, failures: 0, successRate: 100 },
  ]), { limit: 1 })
  assert.equal(dashboard.providers.length, 1)
  assert.equal(dashboard.summary.providers, 1)
})

test('exports a stable dashboard schema and evidence', () => {
  const dashboard = createProviderPerformanceDashboard(metrics([
    { provider: 'github', events: 4, successes: 3, failures: 1, successRate: 75 },
  ]))
  assert.equal(dashboard.schemaVersion, 'supervisor-provider-performance-v1')
  assert.deepEqual(dashboard.providers[0].evidence, ['4 events', '4 measured attempts', '3 successes', '1 failures'])
})