// saas/agent-gateway/cluster-runtime-health-trends.ts
// Deterministic, read-only trend analysis over immutable runtime health timelines.

import type { ClusterRuntimeHealthStatus } from './cluster-runtime-health.ts'
import type { ClusterRuntimeHealthTimeline } from './cluster-runtime-health-timeline.ts'

export type ClusterRuntimeHealthTrend = 'improving' | 'stable' | 'degrading' | 'oscillating'

export interface ClusterRuntimeHealthTrendSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1'
  clusterId: string
  generatedAt: string
  trend: ClusterRuntimeHealthTrend
  transitionCount: number
  recoveryCount: number
  escalationCount: number
  oscillationCount: number
  consecutiveHealthyPeriods: number
  averageDurationMs: Readonly<Record<ClusterRuntimeHealthStatus, number>>
  transitionFrequencyPerHour: number
  reasons: readonly string[]
  safety: Readonly<{ readOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

const RANK: Readonly<Record<ClusterRuntimeHealthStatus, number>> = Object.freeze({ healthy: 0, unknown: 1, warning: 2, critical: 3 })

export function analyzeClusterRuntimeHealthTrend(timeline: ClusterRuntimeHealthTimeline): ClusterRuntimeHealthTrendSnapshot {
  if (!timeline || timeline.schemaVersion !== 'agent-gateway-cluster-runtime-health-timeline-v1') throw new Error('invalid cluster runtime health timeline')
  if (timeline.executable !== false || timeline.safety.infrastructureMutationEnabled !== false || timeline.safety.automaticRepairEnabled !== false) throw new Error('unsafe cluster runtime health timeline')
  if (timeline.entries.length === 0) throw new Error('cluster runtime health trend requires entries')

  const totals: Record<ClusterRuntimeHealthStatus, number> = { healthy: 0, unknown: 0, warning: 0, critical: 0 }
  const counts: Record<ClusterRuntimeHealthStatus, number> = { healthy: 0, unknown: 0, warning: 0, critical: 0 }
  let recoveryCount = 0
  let escalationCount = 0
  let oscillationCount = 0
  let consecutiveHealthyPeriods = 0
  let currentHealthyRun = 0
  let previousDirection = 0

  for (let index = 0; index < timeline.entries.length; index += 1) {
    const entry = timeline.entries[index]
    if (entry.clusterId !== timeline.clusterId || entry.executable !== false || entry.infrastructureMutationEnabled !== false) throw new Error('invalid cluster runtime health trend entry')
    totals[entry.status] += entry.durationMs
    counts[entry.status] += 1
    if (entry.status === 'healthy') {
      currentHealthyRun += 1
      consecutiveHealthyPeriods = Math.max(consecutiveHealthyPeriods, currentHealthyRun)
    } else currentHealthyRun = 0
    if (index === 0) continue
    const prior = timeline.entries[index - 1]
    const direction = Math.sign(RANK[entry.status] - RANK[prior.status])
    if (direction < 0) recoveryCount += 1
    if (direction > 0) escalationCount += 1
    if (previousDirection !== 0 && direction !== 0 && direction !== previousDirection) oscillationCount += 1
    if (direction !== 0) previousDirection = direction
  }

  const averageDurationMs = Object.freeze({
    healthy: counts.healthy ? Math.round(totals.healthy / counts.healthy) : 0,
    unknown: counts.unknown ? Math.round(totals.unknown / counts.unknown) : 0,
    warning: counts.warning ? Math.round(totals.warning / counts.warning) : 0,
    critical: counts.critical ? Math.round(totals.critical / counts.critical) : 0,
  })
  const first = Date.parse(timeline.entries[0].firstObservedAt)
  const last = Date.parse(timeline.generatedAt)
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) throw new Error('invalid cluster runtime health trend timestamps')
  const elapsedHours = Math.max((last - first) / 3_600_000, 1 / 60)
  const transitionFrequencyPerHour = Number((timeline.transitionCount / elapsedHours).toFixed(3))
  const net = RANK[timeline.entries.at(-1)!.status] - RANK[timeline.entries[0].status]
  const trend: ClusterRuntimeHealthTrend = oscillationCount >= 2 ? 'oscillating' : net < 0 ? 'improving' : net > 0 ? 'degrading' : 'stable'
  const reasons = [
    `${recoveryCount} recoveries observed`,
    `${escalationCount} escalations observed`,
    `${oscillationCount} direction reversals observed`,
  ].sort()

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1',
    clusterId: timeline.clusterId,
    generatedAt: timeline.generatedAt,
    trend,
    transitionCount: timeline.transitionCount,
    recoveryCount,
    escalationCount,
    oscillationCount,
    consecutiveHealthyPeriods,
    averageDurationMs,
    transitionFrequencyPerHour,
    reasons: Object.freeze(reasons),
    safety: Object.freeze({ readOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
