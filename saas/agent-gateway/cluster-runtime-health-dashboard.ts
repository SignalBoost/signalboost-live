// saas/agent-gateway/cluster-runtime-health-dashboard.ts
// Deterministic, read-only dashboard aggregation for immutable runtime health artifacts.

import type { ClusterRuntimeHealthStatus } from './cluster-runtime-health.ts'
import type { ClusterRuntimeHealthTimeline, ClusterRuntimeHealthTimelineEntry } from './cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthTrend, ClusterRuntimeHealthTrendSnapshot } from './cluster-runtime-health-trends.ts'
import type { ClusterRuntimeHealthForecast, ClusterRuntimeHealthOutlook } from './cluster-runtime-health-forecast.ts'
import type { ClusterRuntimeHealthRecommendation, ClusterRuntimeHealthRecommendationPriority, ClusterRuntimeHealthRecommendationSnapshot } from './cluster-runtime-health-recommendations.ts'

export interface ClusterRuntimeHealthDashboardSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-health-dashboard-v1'
  clusterId: string
  generatedAt: string
  currentStatus: ClusterRuntimeHealthStatus
  trend: ClusterRuntimeHealthTrend
  outlook: ClusterRuntimeHealthOutlook
  highestRecommendationPriority: ClusterRuntimeHealthRecommendationPriority | null
  activeAdvisories: readonly ClusterRuntimeHealthRecommendation[]
  transitionCount: number
  recoveryCount: number
  escalationCount: number
  forecastConfidence: number
  volatility: number
  recentTransitions: readonly ClusterRuntimeHealthTimelineEntry[]
  summary: readonly string[]
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

const PRIORITY: Readonly<Record<ClusterRuntimeHealthRecommendationPriority, number>> = Object.freeze({ urgent: 0, recommended: 1, informational: 2 })

function assertSafeTimeline(timeline: ClusterRuntimeHealthTimeline): void {
  if (!timeline || timeline.schemaVersion !== 'agent-gateway-cluster-runtime-health-timeline-v1' || timeline.entries.length === 0) throw new Error('invalid cluster runtime health dashboard timeline')
  if (timeline.executable !== false || timeline.safety.readOnly !== true || timeline.safety.infrastructureMutationEnabled !== false || timeline.safety.automaticRepairEnabled !== false) throw new Error('unsafe cluster runtime health dashboard timeline')
}

export function createClusterRuntimeHealthDashboard(
  timeline: ClusterRuntimeHealthTimeline,
  trend: ClusterRuntimeHealthTrendSnapshot,
  forecast: ClusterRuntimeHealthForecast,
  recommendations: ClusterRuntimeHealthRecommendationSnapshot,
): ClusterRuntimeHealthDashboardSnapshot {
  assertSafeTimeline(timeline)
  if (!trend || trend.schemaVersion !== 'agent-gateway-cluster-runtime-health-trend-v1' || trend.executable !== false || trend.safety.infrastructureMutationEnabled !== false) throw new Error('invalid cluster runtime health dashboard trend')
  if (!forecast || forecast.schemaVersion !== 'agent-gateway-cluster-runtime-health-forecast-v1' || forecast.executable !== false || forecast.safety.advisoryOnly !== true || forecast.safety.infrastructureMutationEnabled !== false) throw new Error('invalid cluster runtime health dashboard forecast')
  if (!recommendations || recommendations.schemaVersion !== 'agent-gateway-cluster-runtime-health-recommendations-v1' || recommendations.executable !== false || recommendations.safety.advisoryOnly !== true || recommendations.safety.infrastructureMutationEnabled !== false) throw new Error('invalid cluster runtime health dashboard recommendations')

  const clusterId = timeline.clusterId
  const artifacts = [trend, forecast, recommendations]
  if (artifacts.some(artifact => artifact.clusterId !== clusterId)) throw new Error('cluster runtime health dashboard identity mismatch')
  if (artifacts.some(artifact => artifact.generatedAt !== timeline.generatedAt)) throw new Error('cluster runtime health dashboard generation mismatch')

  const advisoryMap = new Map<string, ClusterRuntimeHealthRecommendation>()
  for (const advisory of recommendations.recommendations) {
    if (advisory.executable !== false || advisory.readOnly !== true || advisory.advisoryOnly !== true) throw new Error('unsafe cluster runtime health dashboard advisory')
    const prior = advisoryMap.get(advisory.code)
    if (!prior || PRIORITY[advisory.priority] < PRIORITY[prior.priority]) advisoryMap.set(advisory.code, advisory)
  }
  const activeAdvisories = [...advisoryMap.values()].sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.code.localeCompare(b.code))
  const highestRecommendationPriority = activeAdvisories[0]?.priority ?? null
  const recentTransitions = [...timeline.entries]
    .sort((a, b) => Date.parse(a.firstObservedAt) - Date.parse(b.firstObservedAt) || a.transitionId.localeCompare(b.transitionId))
    .slice(-5)
  const currentStatus = recentTransitions.at(-1)!.status
  const summary = [
    `Current runtime health is ${currentStatus}.`,
    `Observed trend is ${trend.trend}.`,
    `Forecast outlook is ${forecast.outlook} with ${forecast.confidence.toFixed(3)} confidence.`,
    highestRecommendationPriority ? `Highest advisory priority is ${highestRecommendationPriority}.` : 'No active operator advisories.',
  ].sort()

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-dashboard-v1',
    clusterId,
    generatedAt: timeline.generatedAt,
    currentStatus,
    trend: trend.trend,
    outlook: forecast.outlook,
    highestRecommendationPriority,
    activeAdvisories: Object.freeze(activeAdvisories),
    transitionCount: timeline.transitionCount,
    recoveryCount: trend.recoveryCount,
    escalationCount: trend.escalationCount,
    forecastConfidence: forecast.confidence,
    volatility: forecast.volatility,
    recentTransitions: Object.freeze(recentTransitions),
    summary: Object.freeze(summary),
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
