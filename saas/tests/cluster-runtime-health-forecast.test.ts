import assert from 'node:assert/strict'
import test from 'node:test'

import { forecastClusterRuntimeHealth } from '../agent-gateway/cluster-runtime-health-forecast.ts'
import type { ClusterRuntimeHealthTrend, ClusterRuntimeHealthTrendSnapshot } from '../agent-gateway/cluster-runtime-health-trends.ts'

function trend(value: ClusterRuntimeHealthTrend, overrides: Partial<ClusterRuntimeHealthTrendSnapshot> = {}): ClusterRuntimeHealthTrendSnapshot {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1',
    clusterId: 'gateway-east',
    generatedAt: '2026-07-25T23:30:00.000Z',
    trend: value,
    transitionCount: 4,
    recoveryCount: value === 'improving' ? 3 : 1,
    escalationCount: value === 'degrading' ? 3 : 1,
    oscillationCount: value === 'oscillating' ? 3 : 0,
    consecutiveHealthyPeriods: value === 'improving' ? 2 : 0,
    averageDurationMs: Object.freeze({ healthy: 60_000, unknown: 90_000, warning: 120_000, critical: 180_000 }),
    transitionFrequencyPerHour: 2,
    reasons: Object.freeze([]),
    safety: Object.freeze({ readOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
    ...overrides,
  })
}

test('forecasts improving and degrading trends', () => {
  const improving = forecastClusterRuntimeHealth(trend('improving'))
  assert.equal(improving.outlook, 'improving')
  assert.ok(improving.recoveryProbability > improving.escalationProbability)
  assert.equal(improving.expectedRecoveryMs, 120_000)

  const degrading = forecastClusterRuntimeHealth(trend('degrading'))
  assert.equal(degrading.outlook, 'high-risk')
  assert.ok(degrading.escalationProbability > degrading.recoveryProbability)
  assert.equal(degrading.expectedCriticalMs, 120_000)
})

test('handles stable, oscillating, and insufficient history deterministically', () => {
  assert.equal(forecastClusterRuntimeHealth(trend('stable')).outlook, 'stable')
  assert.equal(forecastClusterRuntimeHealth(trend('oscillating')).outlook, 'high-risk')
  const sparse = forecastClusterRuntimeHealth(trend('stable', { transitionCount: 1 }))
  assert.equal(sparse.outlook, 'watch')
  assert.equal(sparse.confidence, 0.25)
})

test('fails closed on invalid or unsafe trend input', () => {
  assert.throws(() => forecastClusterRuntimeHealth(null as unknown as ClusterRuntimeHealthTrendSnapshot), /invalid/)
  const unsafe = { ...trend('stable'), executable: true } as unknown as ClusterRuntimeHealthTrendSnapshot
  assert.throws(() => forecastClusterRuntimeHealth(unsafe), /unsafe/)
})
