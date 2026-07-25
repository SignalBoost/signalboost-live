import assert from 'node:assert/strict'
import test from 'node:test'

import { recommendClusterRuntimeHealthActions } from '../agent-gateway/cluster-runtime-health-recommendations.ts'
import type { ClusterRuntimeHealthForecast, ClusterRuntimeHealthOutlook } from '../agent-gateway/cluster-runtime-health-forecast.ts'

function forecast(outlook: ClusterRuntimeHealthOutlook, overrides: Partial<ClusterRuntimeHealthForecast> = {}): ClusterRuntimeHealthForecast {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1',
    clusterId: 'gateway-east',
    generatedAt: '2026-07-25T23:00:00.000Z',
    outlook,
    escalationProbability: 0.1,
    recoveryProbability: 0.8,
    expectedRecoveryMs: 60_000,
    expectedCriticalMs: null,
    confidence: 0.75,
    volatility: 0.1,
    reasons: Object.freeze(['4 health periods observed']),
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
    ...overrides,
  })
}

test('healthy forecasts produce deterministic monitoring and recovery guidance', () => {
  const result = recommendClusterRuntimeHealthActions(forecast('improving'))
  assert.deepEqual(result.recommendations.map(item => item.code), ['confirm-recovery-stability', 'monitor-conditions'])
  assert.equal(result.executable, false)
  assert.equal(result.safety.infrastructureMutationEnabled, false)
})

test('watch forecasts recommend escalation investigation without duplicates', () => {
  const result = recommendClusterRuntimeHealthActions(forecast('watch', { escalationProbability: 0.8, recoveryProbability: 0.2 }))
  assert.deepEqual(result.recommendations.map(item => item.code), ['investigate-escalations', 'monitor-conditions'])
  assert.equal(new Set(result.recommendations.map(item => item.code)).size, result.recommendations.length)
})

test('high-risk forecasts place critical review first', () => {
  const result = recommendClusterRuntimeHealthActions(forecast('high-risk', { escalationProbability: 0.9, recoveryProbability: 0.1, expectedCriticalMs: 30_000 }))
  assert.deepEqual(result.recommendations.map(item => item.code), ['review-critical-trend', 'investigate-escalations', 'monitor-conditions'])
  assert.equal(result.recommendations[0].priority, 'urgent')
})

test('stale-term evidence adds bounded operator verification guidance', () => {
  const result = recommendClusterRuntimeHealthActions(forecast('stable', { reasons: Object.freeze(['stale term rejection observed']) }))
  assert.ok(result.recommendations.some(item => item.code === 'verify-stale-term'))
})

test('fails closed for invalid or unsafe forecasts', () => {
  assert.throws(() => recommendClusterRuntimeHealthActions({ ...forecast('stable'), executable: true } as unknown as ClusterRuntimeHealthForecast), /unsafe/)
  assert.throws(() => recommendClusterRuntimeHealthActions({ ...forecast('stable'), generatedAt: 'invalid' }), /identity/)
})
