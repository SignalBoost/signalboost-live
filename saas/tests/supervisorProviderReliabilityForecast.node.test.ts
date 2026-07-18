import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderReliabilityForecast, type ProviderAlertHistorySnapshot } from '../lib/supervisor/index.ts'

const history = (providerTrends: ProviderAlertHistorySnapshot['providerTrends']): ProviderAlertHistorySnapshot => ({
  generatedAt: '2026-07-18T23:30:00.000Z',
  summary: { total: 0, active: 0, resolved: 0, providers: providerTrends.length, escalations: 0, deescalations: 0 },
  records: [],
  providerTrends,
  schemaVersion: 'supervisor-provider-alert-history-v1',
})

const trend = (provider: string, overrides: Partial<ProviderAlertHistorySnapshot['providerTrends'][number]> = {}): ProviderAlertHistorySnapshot['providerTrends'][number] => ({
  provider,
  alertOccurrences: 1,
  activeAlerts: 0,
  resolvedAlerts: 1,
  escalationCount: 0,
  deescalationCount: 0,
  totalActiveDurationMs: 1000,
  averageResolutionDurationMs: 1000,
  lastObservedAt: '2026-07-18T23:00:00.000Z',
  ...overrides,
})

test('returns stable low-risk forecast for resolved history', () => {
  const result = createProviderReliabilityForecast(history([trend('github')]))
  assert.equal(result.forecasts[0].trend, 'stable')
  assert.equal(result.forecasts[0].riskLevel, 'low')
})

test('detects degrading recurrent active provider risk', () => {
  const result = createProviderReliabilityForecast(history([
    trend('vercel', { alertOccurrences: 4, activeAlerts: 2, resolvedAlerts: 2, escalationCount: 3 }),
  ]))
  assert.equal(result.forecasts[0].trend, 'degrading')
  assert.equal(result.forecasts[0].riskLevel, 'critical')
  assert.ok(result.forecasts[0].recurrenceScore > 50)
  assert.ok(result.forecasts[0].stabilityScore < 50)
})

test('detects improving recovery evidence', () => {
  const result = createProviderReliabilityForecast(history([
    trend('browserbase', { alertOccurrences: 3, resolvedAlerts: 3, deescalationCount: 2 }),
  ]))
  assert.equal(result.forecasts[0].trend, 'improving')
})

test('orders highest risk first and applies bounded limit', () => {
  const result = createProviderReliabilityForecast(history([
    trend('github'),
    trend('vercel', { alertOccurrences: 5, activeAlerts: 3, escalationCount: 4 }),
  ]), { limit: 1 })
  assert.equal(result.forecasts.length, 1)
  assert.equal(result.forecasts[0].provider, 'vercel')
})

test('handles empty history and exports stable schema', () => {
  const result = createProviderReliabilityForecast(history([]))
  assert.deepEqual(result.forecasts, [])
  assert.equal(result.schemaVersion, 'supervisor-provider-reliability-forecast-v1')
  assert.equal(result.generatedAt, '2026-07-18T23:30:00.000Z')
})

test('is deterministic for identical input', () => {
  const input = history([trend('vercel'), trend('github')])
  assert.deepEqual(createProviderReliabilityForecast(input), createProviderReliabilityForecast(input))
})
