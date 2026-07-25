import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthDashboard } from '../agent-gateway/cluster-runtime-health-dashboard.ts'
import type { ClusterRuntimeHealthTimeline } from '../agent-gateway/cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthTrendSnapshot } from '../agent-gateway/cluster-runtime-health-trends.ts'
import type { ClusterRuntimeHealthForecast } from '../agent-gateway/cluster-runtime-health-forecast.ts'
import type { ClusterRuntimeHealthRecommendationSnapshot } from '../agent-gateway/cluster-runtime-health-recommendations.ts'

const generatedAt = '2026-07-25T23:40:00.000Z'

function timeline(status: 'healthy' | 'warning' | 'critical' = 'healthy'): ClusterRuntimeHealthTimeline {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-v1', clusterId: 'gateway-east', generatedAt, entries: Object.freeze([{ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-entry-v1', transitionId: `gateway-east:7:${generatedAt}:${status}`, clusterId: 'gateway-east', currentTerm: 7, status, firstObservedAt: generatedAt, lastObservedAt: generatedAt, durationMs: 0, reasons: Object.freeze([]), triggeringAlertIds: Object.freeze([]), readOnly: true, infrastructureMutationEnabled: false, automaticRepairEnabled: false, executable: false }]), transitionCount: 0, safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, automaticRetryEnabled: false, automaticRepairEnabled: false }), executable: false })
}

function trend(value: 'stable' | 'degrading' = 'stable'): ClusterRuntimeHealthTrendSnapshot {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1', clusterId: 'gateway-east', generatedAt, trend: value, transitionCount: 0, recoveryCount: 0, escalationCount: value === 'degrading' ? 2 : 0, oscillationCount: 0, consecutiveHealthyPeriods: value === 'stable' ? 1 : 0, averageDurationMs: Object.freeze({ healthy: 0, unknown: 0, warning: 0, critical: 0 }), transitionFrequencyPerHour: 0, reasons: Object.freeze([]), safety: Object.freeze({ readOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }), executable: false })
}

function forecast(outlook: 'stable' | 'high-risk' = 'stable'): ClusterRuntimeHealthForecast {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1', clusterId: 'gateway-east', generatedAt, outlook, escalationProbability: outlook === 'high-risk' ? 0.9 : 0, recoveryProbability: 0, expectedRecoveryMs: null, expectedCriticalMs: outlook === 'high-risk' ? 60_000 : null, confidence: 0.75, volatility: outlook === 'high-risk' ? 0.6 : 0, reasons: Object.freeze([]), safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }), executable: false })
}

function recommendations(priority: 'informational' | 'urgent' = 'informational'): ClusterRuntimeHealthRecommendationSnapshot {
  const advisory = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-recommendation-v1' as const, recommendationId: `gateway-east:${generatedAt}:monitor-conditions`, priority, code: 'monitor-conditions' as const, guidance: 'Review runtime health.', confidence: 0.75, readOnly: true as const, advisoryOnly: true as const, executable: false as const })
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-recommendations-v1', clusterId: 'gateway-east', generatedAt, recommendations: Object.freeze([advisory, advisory]), safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }), executable: false })
}

test('creates immutable healthy dashboard snapshots and suppresses duplicate advisories', () => {
  const dashboard = createClusterRuntimeHealthDashboard(timeline(), trend(), forecast(), recommendations())
  assert.equal(dashboard.currentStatus, 'healthy')
  assert.equal(dashboard.highestRecommendationPriority, 'informational')
  assert.equal(dashboard.activeAdvisories.length, 1)
  assert.equal(dashboard.executable, false)
  assert.equal(Object.isFrozen(dashboard), true)
})

test('surfaces degraded high-risk state and urgent priority', () => {
  const dashboard = createClusterRuntimeHealthDashboard(timeline('critical'), trend('degrading'), forecast('high-risk'), recommendations('urgent'))
  assert.equal(dashboard.currentStatus, 'critical')
  assert.equal(dashboard.outlook, 'high-risk')
  assert.equal(dashboard.highestRecommendationPriority, 'urgent')
})

test('fails closed for mismatched and unsafe artifacts', () => {
  assert.throws(() => createClusterRuntimeHealthDashboard(timeline(), { ...trend(), clusterId: 'other' }, forecast(), recommendations()), /identity mismatch/)
  assert.throws(() => createClusterRuntimeHealthDashboard({ ...timeline(), executable: true } as unknown as ClusterRuntimeHealthTimeline, trend(), forecast(), recommendations()), /unsafe/)
})
