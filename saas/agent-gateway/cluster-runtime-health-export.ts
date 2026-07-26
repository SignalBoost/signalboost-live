// saas/agent-gateway/cluster-runtime-health-export.ts
// Deterministic, immutable export contract for governed runtime health advisory artifacts.

import type { ClusterRuntimeHealthDashboardSnapshot } from './cluster-runtime-health-dashboard.ts'
import type { ClusterRuntimeHealthTimeline } from './cluster-runtime-health-timeline.ts'
import type { ClusterRuntimeHealthTrendSnapshot } from './cluster-runtime-health-trends.ts'
import type { ClusterRuntimeHealthForecast } from './cluster-runtime-health-forecast.ts'
import type { ClusterRuntimeHealthRecommendationSnapshot } from './cluster-runtime-health-recommendations.ts'

export interface ClusterRuntimeHealthExportBundle {
  schemaVersion: 'agent-gateway-cluster-runtime-health-export-v1'
  exportId: string
  clusterId: string
  generatedAt: string
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true }>
  dashboard: ClusterRuntimeHealthDashboardSnapshot
  timelineSummary: Readonly<{ transitionCount: number; statuses: readonly string[]; recentTransitionIds: readonly string[] }>
  trend: ClusterRuntimeHealthTrendSnapshot
  forecast: ClusterRuntimeHealthForecast
  recommendations: ClusterRuntimeHealthRecommendationSnapshot
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown): string {
  const input = canonical(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createClusterRuntimeHealthExport(
  dashboard: ClusterRuntimeHealthDashboardSnapshot,
  timeline: ClusterRuntimeHealthTimeline,
  trend: ClusterRuntimeHealthTrendSnapshot,
  forecast: ClusterRuntimeHealthForecast,
  recommendations: ClusterRuntimeHealthRecommendationSnapshot,
): ClusterRuntimeHealthExportBundle {
  if (!dashboard || dashboard.schemaVersion !== 'agent-gateway-cluster-runtime-health-dashboard-v1' || dashboard.executable !== false || dashboard.safety.advisoryOnly !== true) throw new Error('invalid cluster runtime health export dashboard')
  if (!timeline || timeline.schemaVersion !== 'agent-gateway-cluster-runtime-health-timeline-v1' || timeline.executable !== false || timeline.safety.infrastructureMutationEnabled !== false) throw new Error('invalid cluster runtime health export timeline')
  if (!trend || trend.schemaVersion !== 'agent-gateway-cluster-runtime-health-trend-v1' || trend.executable !== false) throw new Error('invalid cluster runtime health export trend')
  if (!forecast || forecast.schemaVersion !== 'agent-gateway-cluster-runtime-health-forecast-v1' || forecast.executable !== false || forecast.safety.advisoryOnly !== true) throw new Error('invalid cluster runtime health export forecast')
  if (!recommendations || recommendations.schemaVersion !== 'agent-gateway-cluster-runtime-health-recommendations-v1' || recommendations.executable !== false || recommendations.safety.advisoryOnly !== true) throw new Error('invalid cluster runtime health export recommendations')

  const clusterId = dashboard.clusterId
  const artifacts = [timeline, trend, forecast, recommendations]
  if (artifacts.some(artifact => artifact.clusterId !== clusterId)) throw new Error('cluster runtime health export identity mismatch')
  if (artifacts.some(artifact => artifact.generatedAt !== dashboard.generatedAt)) throw new Error('cluster runtime health export generation mismatch')

  const orderedEntries = [...timeline.entries].sort((a, b) => Date.parse(a.firstObservedAt) - Date.parse(b.firstObservedAt) || a.transitionId.localeCompare(b.transitionId))
  const timelineSummary = Object.freeze({
    transitionCount: timeline.transitionCount,
    statuses: Object.freeze([...new Set(orderedEntries.map(entry => entry.status))].sort()),
    recentTransitionIds: Object.freeze([...new Set(orderedEntries.slice(-10).map(entry => entry.transitionId))].sort()),
  })
  const payload = { dashboard, timelineSummary, trend, forecast, recommendations }
  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest(payload), canonical: true as const })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-export-v1',
    exportId: `${clusterId}:${dashboard.generatedAt}:${integrity.digest}`,
    clusterId,
    generatedAt: dashboard.generatedAt,
    integrity,
    dashboard,
    timelineSummary,
    trend,
    forecast,
    recommendations,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
