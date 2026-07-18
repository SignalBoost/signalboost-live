import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createProviderReliabilityAlerts,
  type ProviderPerformanceDashboard,
  type ProviderPerformanceRow,
} from '../lib/supervisor/index.ts'

const dashboard = (providers: ProviderPerformanceRow[], generatedAt = '2026-07-18T22:00:00.000Z'): ProviderPerformanceDashboard => ({
  generatedAt,
  window: '24h',
  summary: {
    providers: providers.length,
    healthy: providers.filter(provider => provider.state === 'healthy').length,
    warning: providers.filter(provider => provider.state === 'warning').length,
    critical: providers.filter(provider => provider.state === 'critical').length,
    unknown: providers.filter(provider => provider.state === 'unknown').length,
    totalAttempts: providers.reduce((sum, provider) => sum + provider.successes + provider.failures, 0),
    totalSuccesses: providers.reduce((sum, provider) => sum + provider.successes, 0),
    totalFailures: providers.reduce((sum, provider) => sum + provider.failures, 0),
    overallSuccessRate: null,
  },
  providers,
  schemaVersion: 'supervisor-provider-performance-v1',
})

const provider = (overrides: Partial<ProviderPerformanceRow> & Pick<ProviderPerformanceRow, 'provider'>): ProviderPerformanceRow => ({
  events: 10,
  successes: 8,
  failures: 2,
  successRate: 80,
  failureRate: 20,
  state: 'warning',
  rank: 1,
  evidence: ['10 events', '10 measured attempts'],
  ...overrides,
})

test('creates critical and warning reliability alerts', () => {
  const snapshot = createProviderReliabilityAlerts(dashboard([
    provider({ provider: 'github', state: 'critical', successRate: 70 }),
    provider({ provider: 'vercel', state: 'warning', successRate: 85 }),
    provider({ provider: 'browserbase', state: 'healthy', successRate: 99 }),
  ]))
  assert.deepEqual(snapshot.alerts.map(alert => alert.type), ['critical_provider', 'warning_provider'])
  assert.deepEqual(snapshot.summary, { total: 2, critical: 1, warning: 1, info: 0, providersAffected: 2 })
})

test('detects material success-rate drops against a previous snapshot', () => {
  const previous = dashboard([provider({ provider: 'github', state: 'healthy', successRate: 98 })], '2026-07-17T22:00:00.000Z')
  const current = dashboard([provider({ provider: 'github', state: 'warning', successRate: 82 })])
  const snapshot = createProviderReliabilityAlerts(current, { previous, minimumDropPercentagePoints: 10 })
  const drop = snapshot.alerts.find(alert => alert.type === 'success_rate_drop')
  assert.equal(drop?.deltaPercentagePoints, -16)
  assert.equal(drop?.severity, 'warning')
})

test('raises a critical drop alert when decline doubles the threshold', () => {
  const previous = dashboard([provider({ provider: 'vercel', state: 'healthy', successRate: 100 })])
  const current = dashboard([provider({ provider: 'vercel', state: 'critical', successRate: 70 })])
  const snapshot = createProviderReliabilityAlerts(current, { previous, minimumDropPercentagePoints: 10 })
  assert.equal(snapshot.alerts.find(alert => alert.type === 'success_rate_drop')?.severity, 'critical')
})

test('keeps insufficient-data alerts opt-in', () => {
  const current = dashboard([provider({ provider: 'github', state: 'unknown', successRate: null })])
  assert.equal(createProviderReliabilityAlerts(current).alerts.length, 0)
  assert.equal(createProviderReliabilityAlerts(current, { includeUnknown: true }).alerts[0].type, 'insufficient_data')
})

test('orders alerts by severity and applies a bounded limit', () => {
  const current = dashboard([
    provider({ provider: 'warning', state: 'warning', successRate: 85 }),
    provider({ provider: 'critical', state: 'critical', successRate: 60 }),
  ])
  const snapshot = createProviderReliabilityAlerts(current, { limit: 1 })
  assert.equal(snapshot.alerts.length, 1)
  assert.equal(snapshot.alerts[0].provider, 'critical')
})

test('exports stable alert identifiers and schema', () => {
  const snapshot = createProviderReliabilityAlerts(dashboard([
    provider({ provider: 'github', state: 'critical', successRate: 70 }),
  ]))
  assert.equal(snapshot.alerts[0].alertId, 'github:critical_provider')
  assert.equal(snapshot.schemaVersion, 'supervisor-provider-reliability-alerts-v1')
})
