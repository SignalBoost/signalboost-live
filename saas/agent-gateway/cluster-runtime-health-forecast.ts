// saas/agent-gateway/cluster-runtime-health-forecast.ts
// Deterministic advisory forecast over immutable runtime health trend snapshots.

import type { ClusterRuntimeHealthTrendSnapshot } from './cluster-runtime-health-trends.ts'

export type ClusterRuntimeHealthOutlook = 'improving' | 'stable' | 'watch' | 'high-risk'

export interface ClusterRuntimeHealthForecast {
  schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1'
  clusterId: string
  generatedAt: string
  outlook: ClusterRuntimeHealthOutlook
  escalationProbability: number
  recoveryProbability: number
  expectedRecoveryMs: number | null
  expectedCriticalMs: number | null
  confidence: number
  volatility: number
  reasons: readonly string[]
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

function bounded(value: number): number { return Number(Math.max(0, Math.min(1, value)).toFixed(3)) }

export function forecastClusterRuntimeHealth(trend: ClusterRuntimeHealthTrendSnapshot): ClusterRuntimeHealthForecast {
  if (!trend || trend.schemaVersion !== 'agent-gateway-cluster-runtime-health-trend-v1') throw new Error('invalid cluster runtime health trend')
  if (trend.executable !== false || trend.safety.infrastructureMutationEnabled !== false || trend.safety.automaticRepairEnabled !== false) throw new Error('unsafe cluster runtime health trend')
  const observed = trend.transitionCount + 1
  const confidence = bounded(observed / 8)
  const movement = Math.max(1, trend.recoveryCount + trend.escalationCount)
  const escalationProbability = bounded((trend.escalationCount + trend.oscillationCount * 0.5) / movement)
  const recoveryProbability = bounded((trend.recoveryCount + trend.consecutiveHealthyPeriods * 0.25) / movement)
  const volatility = bounded(trend.oscillationCount / Math.max(1, trend.transitionCount))
  const averageRecovery = trend.averageDurationMs.warning || trend.averageDurationMs.critical || null
  const averageCritical = trend.averageDurationMs.warning || trend.averageDurationMs.unknown || null
  const outlook: ClusterRuntimeHealthOutlook =
    observed < 3 ? 'watch' : trend.trend === 'improving' ? 'improving' : trend.trend === 'stable' ? 'stable' : trend.trend === 'degrading' ? 'high-risk' : volatility >= 0.5 ? 'high-risk' : 'watch'
  const reasons = [
    `${trend.escalationCount} escalations observed`,
    `${trend.recoveryCount} recoveries observed`,
    `${trend.oscillationCount} direction reversals observed`,
    `${observed} health periods observed`,
  ].sort()
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1',
    clusterId: trend.clusterId,
    generatedAt: trend.generatedAt,
    outlook,
    escalationProbability,
    recoveryProbability,
    expectedRecoveryMs: outlook === 'improving' || outlook === 'watch' ? averageRecovery : null,
    expectedCriticalMs: outlook === 'high-risk' ? averageCritical : null,
    confidence,
    volatility,
    reasons: Object.freeze(reasons),
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
