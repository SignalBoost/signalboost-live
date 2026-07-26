import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthExport } from '../agent-gateway/cluster-runtime-health-export.ts'
import type { ClusterRuntimeHealthDashboardSnapshot } from '../agent-gateway/cluster-runtime-health-dashboard.ts'
import type { ClusterRuntimeHealthTimeline } from '../agent-gateway/cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthTrendSnapshot } from '../agent-gateway/cluster-runtime-health-trends.ts'
import type { ClusterRuntimeHealthForecast } from '../agent-gateway/cluster-runtime-health-forecast.ts'
import type { ClusterRuntimeHealthRecommendationSnapshot } from '../agent-gateway/cluster-runtime-health-recommendations.ts'

const generatedAt = '2026-07-25T23:00:00.000Z'
const safety = Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const })
const entry = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-entry-v1' as const, transitionId: 'gateway-east:7:healthy', clusterId: 'gateway-east', currentTerm: 7, status: 'healthy' as const, firstObservedAt: generatedAt, lastObservedAt: generatedAt, durationMs: 0, reasons: Object.freeze([]), triggeringAlertIds: Object.freeze([]), readOnly: true as const, infrastructureMutationEnabled: false as const, automaticRepairEnabled: false as const, executable: false as const })
const timeline = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-timeline-v1' as const, clusterId: 'gateway-east', generatedAt, entries: Object.freeze([entry, entry]), transitionCount: 0, safety: Object.freeze({ readOnly: true as const, infrastructureMutationEnabled: false as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const }), executable: false as const }) satisfies ClusterRuntimeHealthTimeline
const trend = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1' as const, clusterId: 'gateway-east', generatedAt, trend: 'stable' as const, transitionCount: 0, recoveryCount: 0, escalationCount: 0, oscillationCount: 0, consecutiveHealthyPeriods: 1, averageDurationMs: Object.freeze({ healthy: 0, unknown: 0, warning: 0, critical: 0 }), transitionFrequencyPerHour: 0, reasons: Object.freeze([]), safety: Object.freeze({ readOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const }), executable: false as const }) satisfies ClusterRuntimeHealthTrendSnapshot
const forecast = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1' as const, clusterId: 'gateway-east', generatedAt, outlook: 'stable' as const, escalationProbability: 0, recoveryProbability: 0, expectedRecoveryMs: null, expectedCriticalMs: null, confidence: 0.5, volatility: 0, reasons: Object.freeze([]), safety, executable: false as const }) satisfies ClusterRuntimeHealthForecast
const recommendations = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-recommendations-v1' as const, clusterId: 'gateway-east', generatedAt, recommendations: Object.freeze([]), safety, executable: false as const }) satisfies ClusterRuntimeHealthRecommendationSnapshot
const dashboard = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-dashboard-v1' as const, clusterId: 'gateway-east', generatedAt, currentStatus: 'healthy' as const, trend: 'stable' as const, outlook: 'stable' as const, highestRecommendationPriority: null, activeAdvisories: Object.freeze([]), transitionCount: 0, recoveryCount: 0, escalationCount: 0, forecastConfidence: 0.5, volatility: 0, recentTransitions: Object.freeze([entry]), summary: Object.freeze([]), safety, executable: false as const }) satisfies ClusterRuntimeHealthDashboardSnapshot

test('creates identical immutable exports and removes duplicate timeline identifiers', () => {
  const first = createClusterRuntimeHealthExport(dashboard, timeline, trend, forecast, recommendations)
  const second = createClusterRuntimeHealthExport(dashboard, timeline, trend, forecast, recommendations)
  assert.deepEqual(first, second)
  assert.equal(first.exportId, second.exportId)
  assert.deepEqual(first.timelineSummary.recentTransitionIds, ['gateway-east:7:healthy'])
  assert.equal(first.integrity.canonical, true)
  assert.equal(first.executable, false)
  assert.equal(Object.isFrozen(first), true)
})

test('fails closed for schema, identity, generation, and safety violations', () => {
  assert.throws(() => createClusterRuntimeHealthExport({ ...dashboard, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthDashboardSnapshot, timeline, trend, forecast, recommendations), /invalid/)
  assert.throws(() => createClusterRuntimeHealthExport(dashboard, { ...timeline, clusterId: 'other' } as ClusterRuntimeHealthTimeline, trend, forecast, recommendations), /identity mismatch/)
  assert.throws(() => createClusterRuntimeHealthExport(dashboard, timeline, { ...trend, generatedAt: '2026-07-25T23:01:00.000Z' } as ClusterRuntimeHealthTrendSnapshot, forecast, recommendations), /generation mismatch/)
  assert.throws(() => createClusterRuntimeHealthExport(dashboard, timeline, trend, { ...forecast, executable: true } as unknown as ClusterRuntimeHealthForecast, recommendations), /invalid/)
})
