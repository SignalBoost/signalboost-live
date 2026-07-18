import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createProviderAlertLifecycle,
  type ProviderReliabilityAlert,
  type ProviderReliabilityAlertSnapshot,
} from '../lib/supervisor/index.ts'

const alert = (overrides: Partial<ProviderReliabilityAlert> & Pick<ProviderReliabilityAlert, 'alertId' | 'provider'>): ProviderReliabilityAlert => ({
  type: 'warning_provider',
  severity: 'warning',
  message: 'attention',
  currentSuccessRate: 80,
  previousSuccessRate: null,
  deltaPercentagePoints: null,
  evidence: [],
  ...overrides,
})

const snapshot = (alerts: ProviderReliabilityAlert[], generatedAt = '2026-07-18T23:00:00.000Z'): ProviderReliabilityAlertSnapshot => ({
  generatedAt,
  window: '24h',
  summary: {
    total: alerts.length,
    critical: alerts.filter(item => item.severity === 'critical').length,
    warning: alerts.filter(item => item.severity === 'warning').length,
    info: alerts.filter(item => item.severity === 'info').length,
    providersAffected: new Set(alerts.map(item => item.provider)).size,
  },
  alerts,
  schemaVersion: 'supervisor-provider-reliability-alerts-v1',
})

test('classifies opened, ongoing, and resolved alerts', () => {
  const previous = snapshot([
    alert({ alertId: 'github:warning_provider', provider: 'github' }),
    alert({ alertId: 'vercel:warning_provider', provider: 'vercel' }),
  ])
  const current = snapshot([
    alert({ alertId: 'github:warning_provider', provider: 'github' }),
    alert({ alertId: 'browserbase:warning_provider', provider: 'browserbase' }),
  ])
  const lifecycle = createProviderAlertLifecycle(current, previous)
  assert.deepEqual(lifecycle.summary, { total: 3, opened: 1, ongoing: 1, escalated: 0, deescalated: 0, resolved: 1 })
})

test('detects severity escalation and deescalation', () => {
  const previous = snapshot([
    alert({ alertId: 'github:warning_provider', provider: 'github', severity: 'warning' }),
    alert({ alertId: 'vercel:warning_provider', provider: 'vercel', severity: 'critical' }),
  ])
  const current = snapshot([
    alert({ alertId: 'github:warning_provider', provider: 'github', severity: 'critical' }),
    alert({ alertId: 'vercel:warning_provider', provider: 'vercel', severity: 'warning' }),
  ])
  const lifecycle = createProviderAlertLifecycle(current, previous)
  assert.equal(lifecycle.entries.find(entry => entry.provider === 'github')?.state, 'escalated')
  assert.equal(lifecycle.entries.find(entry => entry.provider === 'vercel')?.state, 'deescalated')
})

test('can omit unchanged ongoing alerts', () => {
  const item = alert({ alertId: 'github:warning_provider', provider: 'github' })
  assert.equal(createProviderAlertLifecycle(snapshot([item]), snapshot([item]), { includeOngoing: false }).entries.length, 0)
})

test('orders urgent changes first and applies a bounded limit', () => {
  const previous = snapshot([alert({ alertId: 'github:warning_provider', provider: 'github', severity: 'warning' })])
  const current = snapshot([
    alert({ alertId: 'github:warning_provider', provider: 'github', severity: 'critical' }),
    alert({ alertId: 'vercel:warning_provider', provider: 'vercel' }),
  ])
  const lifecycle = createProviderAlertLifecycle(current, previous, { limit: 1 })
  assert.equal(lifecycle.entries[0].state, 'escalated')
})

test('exports a stable lifecycle schema', () => {
  const lifecycle = createProviderAlertLifecycle(snapshot([]))
  assert.equal(lifecycle.schemaVersion, 'supervisor-provider-alert-lifecycle-v1')
  assert.equal(lifecycle.generatedAt, '2026-07-18T23:00:00.000Z')
})
