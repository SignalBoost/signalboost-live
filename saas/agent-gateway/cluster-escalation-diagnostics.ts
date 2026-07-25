// saas/agent-gateway/cluster-escalation-diagnostics.ts
//
// Read-only operator diagnostics for durable cluster escalation lifecycle records.
// This module exposes no notification, acknowledgment, closure, expiration, or remediation controls.

import type { ClusterEscalationLifecycleRecord, ClusterEscalationLifecycleState } from './cluster-escalation-lifecycle.ts'
import type { ClusterAlertEscalationLevel } from './cluster-alert-escalation.ts'

export type ClusterEscalationDiagnosticStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export interface ClusterEscalationDiagnosticItem {
  schemaVersion: 'agent-gateway-cluster-escalation-diagnostic-item-v1'
  recommendationId: string
  alertId: string
  level: ClusterAlertEscalationLevel
  state: ClusterEscalationLifecycleState
  recurring: boolean
  stale: boolean
  occurrenceCount: number
  firstRecommendedAt: string
  lastRecommendedAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  closedAt: string | null
  closureReason: string | null
  expiredAt: string | null
  notificationsEnabled: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterEscalationDiagnosticsSnapshot {
  schemaVersion: 'agent-gateway-cluster-escalation-diagnostics-v1'
  clusterId: string
  generatedAt: string
  status: ClusterEscalationDiagnosticStatus
  totalRecommendations: number
  openRecommendations: number
  acknowledgedRecommendations: number
  closedRecommendations: number
  expiredRecommendations: number
  recurringRecommendations: number
  staleRecommendations: number
  incidentRecommendations: number
  executiveRecommendations: number
  items: readonly ClusterEscalationDiagnosticItem[]
  safety: Readonly<{ readOnly: true; notificationControlsExposed: false; remediationControlsExposed: false; notificationsEnabled: false; automaticRemediationEnabled: false }>
  executable: false
}

function iso(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster escalation diagnostics timestamp')
  return new Date(parsed).toISOString()
}

export function createClusterEscalationDiagnostics(input: {
  clusterId: string
  generatedAt: string
  records: readonly ClusterEscalationLifecycleRecord[]
  staleAfterMs?: number
}): ClusterEscalationDiagnosticsSnapshot {
  const generatedAt = iso(input.generatedAt)
  const generatedAtMs = Date.parse(generatedAt)
  const staleAfterMs = input.staleAfterMs ?? 300_000
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) throw new Error('invalid cluster escalation stale boundary')
  const seen = new Set<string>()
  const items = [...input.records].sort((a, b) => a.recommendationId.localeCompare(b.recommendationId)).map(record => {
    if (record.clusterId !== input.clusterId) throw new Error('cluster escalation diagnostics record mismatch')
    if (seen.has(record.recommendationId)) throw new Error('duplicate cluster escalation lifecycle record')
    seen.add(record.recommendationId)
    const lastRecommendedAt = iso(record.lastRecommendedAt)
    const stale = (record.state === 'open' || record.state === 'acknowledged') && generatedAtMs - Date.parse(lastRecommendedAt) >= staleAfterMs
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-escalation-diagnostic-item-v1' as const,
      recommendationId: record.recommendationId,
      alertId: record.alertId,
      level: record.level,
      state: record.state,
      recurring: record.occurrenceCount > 1,
      stale,
      occurrenceCount: record.occurrenceCount,
      firstRecommendedAt: iso(record.firstRecommendedAt),
      lastRecommendedAt,
      acknowledgedAt: record.acknowledgedAt ? iso(record.acknowledgedAt) : null,
      acknowledgedBy: record.acknowledgedBy ?? null,
      closedAt: record.closedAt ? iso(record.closedAt) : null,
      closureReason: record.closureReason ?? null,
      expiredAt: record.expiredAt ? iso(record.expiredAt) : null,
      notificationsEnabled: false as const,
      automaticRemediationEnabled: false as const,
      readOnly: true as const,
      executable: false as const,
    })
  })
  const openRecommendations = items.filter(item => item.state === 'open').length
  const acknowledgedRecommendations = items.filter(item => item.state === 'acknowledged').length
  const closedRecommendations = items.filter(item => item.state === 'closed').length
  const expiredRecommendations = items.filter(item => item.state === 'expired').length
  const recurringRecommendations = items.filter(item => item.recurring).length
  const staleRecommendations = items.filter(item => item.stale).length
  const incidentRecommendations = items.filter(item => item.level === 'incident' && (item.state === 'open' || item.state === 'acknowledged')).length
  const executiveRecommendations = items.filter(item => item.level === 'executive' && (item.state === 'open' || item.state === 'acknowledged')).length
  const status: ClusterEscalationDiagnosticStatus = executiveRecommendations > 0 || staleRecommendations > 0 ? 'critical' : incidentRecommendations > 0 || openRecommendations > 0 || acknowledgedRecommendations > 0 ? 'degraded' : items.length === 0 ? 'unknown' : 'healthy'
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-diagnostics-v1',
    clusterId: input.clusterId,
    generatedAt,
    status,
    totalRecommendations: items.length,
    openRecommendations,
    acknowledgedRecommendations,
    closedRecommendations,
    expiredRecommendations,
    recurringRecommendations,
    staleRecommendations,
    incidentRecommendations,
    executiveRecommendations,
    items: Object.freeze(items),
    safety: Object.freeze({ readOnly: true, notificationControlsExposed: false, remediationControlsExposed: false, notificationsEnabled: false, automaticRemediationEnabled: false }),
    executable: false,
  })
}
