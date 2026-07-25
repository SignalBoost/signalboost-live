// saas/agent-gateway/cluster-escalation-trends.ts
//
// Deterministic, read-only trend analysis for cluster escalation diagnostics.
// This module sends no notifications and performs no remediation.

import type { ClusterEscalationDiagnosticsSnapshot } from './cluster-escalation-diagnostics.ts'

export type ClusterEscalationTrend = 'rising' | 'stable' | 'declining' | 'unknown'

export interface ClusterEscalationTrendPoint {
  schemaVersion: 'agent-gateway-cluster-escalation-trend-point-v1'
  generatedAt: string
  activeRecommendations: number
  recurringRecommendations: number
  incidentRecommendations: number
  executiveRecommendations: number
  pressureScore: number
  readOnly: true
  executable: false
}

export interface ClusterEscalationTrendAnalysis {
  schemaVersion: 'agent-gateway-cluster-escalation-trend-analysis-v1'
  clusterId: string
  generatedAt: string
  trend: ClusterEscalationTrend
  delta: number
  recurringPressure: boolean
  incidentPressure: boolean
  executivePressure: boolean
  points: readonly ClusterEscalationTrendPoint[]
  notificationsEnabled: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

function iso(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster escalation trend timestamp')
  return new Date(parsed).toISOString()
}

function point(snapshot: ClusterEscalationDiagnosticsSnapshot): ClusterEscalationTrendPoint {
  const activeRecommendations = snapshot.openRecommendations + snapshot.acknowledgedRecommendations
  const pressureScore = activeRecommendations + snapshot.recurringRecommendations * 2 + snapshot.incidentRecommendations * 3 + snapshot.executiveRecommendations * 5
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-trend-point-v1',
    generatedAt: iso(snapshot.generatedAt),
    activeRecommendations,
    recurringRecommendations: snapshot.recurringRecommendations,
    incidentRecommendations: snapshot.incidentRecommendations,
    executiveRecommendations: snapshot.executiveRecommendations,
    pressureScore,
    readOnly: true,
    executable: false,
  })
}

export function analyzeClusterEscalationTrends(input: {
  clusterId: string
  snapshots: readonly ClusterEscalationDiagnosticsSnapshot[]
  stableDelta?: number
}): ClusterEscalationTrendAnalysis {
  const stableDelta = input.stableDelta ?? 1
  if (!Number.isSafeInteger(stableDelta) || stableDelta < 0) throw new Error('invalid cluster escalation stable delta')
  const seen = new Set<string>()
  const ordered = [...input.snapshots].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt))
  for (const snapshot of ordered) {
    if (!snapshot || snapshot.schemaVersion !== 'agent-gateway-cluster-escalation-diagnostics-v1') throw new Error('invalid cluster escalation diagnostics snapshot')
    if (snapshot.clusterId !== input.clusterId) throw new Error('cluster escalation trend snapshot mismatch')
    const generatedAt = iso(snapshot.generatedAt)
    if (seen.has(generatedAt)) throw new Error('duplicate cluster escalation trend timestamp')
    seen.add(generatedAt)
  }
  const points = ordered.map(point)
  const first = points[0]
  const last = points.at(-1)
  const delta = first && last ? last.pressureScore - first.pressureScore : 0
  const trend: ClusterEscalationTrend = points.length < 2 ? 'unknown' : Math.abs(delta) <= stableDelta ? 'stable' : delta > 0 ? 'rising' : 'declining'
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-trend-analysis-v1',
    clusterId: input.clusterId,
    generatedAt: last?.generatedAt ?? new Date(0).toISOString(),
    trend,
    delta,
    recurringPressure: points.some(item => item.recurringRecommendations > 0),
    incidentPressure: points.some(item => item.incidentRecommendations > 0),
    executivePressure: points.some(item => item.executiveRecommendations > 0),
    points: Object.freeze(points),
    notificationsEnabled: false,
    automaticRemediationEnabled: false,
    readOnly: true,
    executable: false,
  })
}
