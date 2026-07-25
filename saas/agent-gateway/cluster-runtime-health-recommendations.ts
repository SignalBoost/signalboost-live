// saas/agent-gateway/cluster-runtime-health-recommendations.ts
// Deterministic, read-only operator recommendations from immutable runtime health forecasts.

import type { ClusterRuntimeHealthForecast } from './cluster-runtime-health-forecast.ts'

export type ClusterRuntimeHealthRecommendationPriority = 'informational' | 'recommended' | 'urgent'

export interface ClusterRuntimeHealthRecommendation {
  schemaVersion: 'agent-gateway-cluster-runtime-health-recommendation-v1'
  recommendationId: string
  priority: ClusterRuntimeHealthRecommendationPriority
  code: 'monitor-conditions' | 'investigate-escalations' | 'review-critical-trend' | 'verify-stale-term' | 'confirm-recovery-stability'
  guidance: string
  confidence: number
  readOnly: true
  advisoryOnly: true
  executable: false
}

export interface ClusterRuntimeHealthRecommendationSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-health-recommendations-v1'
  clusterId: string
  generatedAt: string
  recommendations: readonly ClusterRuntimeHealthRecommendation[]
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

const PRIORITY: Readonly<Record<ClusterRuntimeHealthRecommendationPriority, number>> = Object.freeze({ urgent: 0, recommended: 1, informational: 2 })

export function recommendClusterRuntimeHealthActions(forecast: ClusterRuntimeHealthForecast): ClusterRuntimeHealthRecommendationSnapshot {
  if (!forecast || forecast.schemaVersion !== 'agent-gateway-cluster-runtime-health-forecast-v1') throw new Error('invalid cluster runtime health forecast')
  if (forecast.executable !== false || forecast.safety.readOnly !== true || forecast.safety.advisoryOnly !== true || forecast.safety.infrastructureMutationEnabled !== false || forecast.safety.automaticRepairEnabled !== false) throw new Error('unsafe cluster runtime health forecast')
  if (!forecast.clusterId || !Number.isFinite(Date.parse(forecast.generatedAt))) throw new Error('invalid cluster runtime health forecast identity')

  const candidates: Omit<ClusterRuntimeHealthRecommendation, 'schemaVersion' | 'recommendationId' | 'readOnly' | 'advisoryOnly' | 'executable'>[] = []
  candidates.push({ priority: 'informational', code: 'monitor-conditions', guidance: 'Monitor current runtime health conditions and review subsequent immutable snapshots.', confidence: forecast.confidence })
  if (forecast.escalationProbability >= 0.4 || forecast.outlook === 'watch') candidates.push({ priority: 'recommended', code: 'investigate-escalations', guidance: 'Investigate repeated health escalations and correlate them with delivery and alert diagnostics.', confidence: forecast.confidence })
  if (forecast.outlook === 'high-risk') candidates.push({ priority: 'urgent', code: 'review-critical-trend', guidance: 'Review the persistent critical or degrading trend before authorizing further governed runtime activity.', confidence: forecast.confidence })
  if (forecast.reasons.some(reason => reason.toLowerCase().includes('term'))) candidates.push({ priority: 'recommended', code: 'verify-stale-term', guidance: 'Verify cluster term ownership and inspect stale-owner or fencing rejections.', confidence: forecast.confidence })
  if (forecast.outlook === 'improving' || forecast.recoveryProbability > forecast.escalationProbability) candidates.push({ priority: 'recommended', code: 'confirm-recovery-stability', guidance: 'Confirm recovery remains stable across additional health periods before resuming normal operations.', confidence: forecast.confidence })

  const unique = new Map(candidates.map(candidate => [candidate.code, candidate]))
  const recommendations = [...unique.values()]
    .sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.code.localeCompare(b.code))
    .map(candidate => Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-recommendation-v1' as const,
      recommendationId: `${forecast.clusterId}:${forecast.generatedAt}:${candidate.code}`,
      ...candidate,
      confidence: Number(Math.max(0, Math.min(1, candidate.confidence)).toFixed(3)),
      readOnly: true as const,
      advisoryOnly: true as const,
      executable: false as const,
    }))

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-recommendations-v1',
    clusterId: forecast.clusterId,
    generatedAt: forecast.generatedAt,
    recommendations: Object.freeze(recommendations),
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
