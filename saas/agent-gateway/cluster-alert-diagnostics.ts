// saas/agent-gateway/cluster-alert-diagnostics.ts
//
// Read-only operator diagnostics for durable cluster alert lifecycle records.
// This module exposes no acknowledgment, resolution, retry, or remediation controls.

import type { ClusterAlertLifecycleRecord, ClusterAlertLifecycleState } from './cluster-alert-lifecycle.ts'
import type { ClusterDeliveryAlertKind, ClusterDeliveryAlertSeverity } from './cluster-delivery-alerts.ts'

export type ClusterAlertDiagnosticStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export interface ClusterAlertDiagnosticItem {
  schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1'
  alertId: string
  instructionId: string
  kind: ClusterDeliveryAlertKind
  severity: ClusterDeliveryAlertSeverity
  state: ClusterAlertLifecycleState
  recurring: boolean
  stale: boolean
  occurrenceCount: number
  firstDetectedAt: string
  lastDetectedAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  resolutionReason: string | null
  readOnly: true
  automaticRemediationEnabled: false
  executable: false
}

export interface ClusterAlertDiagnosticsSnapshot {
  schemaVersion: 'agent-gateway-cluster-alert-diagnostics-v1'
  clusterId: string
  generatedAt: string
  status: ClusterAlertDiagnosticStatus
  totalAlerts: number
  activeAlerts: number
  acknowledgedAlerts: number
  resolvedAlerts: number
  recurringAlerts: number
  staleAlerts: number
  warningAlerts: number
  criticalAlerts: number
  items: readonly ClusterAlertDiagnosticItem[]
  safety: Readonly<{ readOnly: true; remediationControlsExposed: false; automaticRemediationEnabled: false }>
  executable: false
}

function iso(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster alert diagnostics timestamp')
  return new Date(parsed).toISOString()
}

export function createClusterAlertDiagnostics(input: {
  clusterId: string
  generatedAt: string
  records: readonly ClusterAlertLifecycleRecord[]
  staleAfterMs?: number
}): ClusterAlertDiagnosticsSnapshot {
  const generatedAt = iso(input.generatedAt)
  const generatedAtMs = Date.parse(generatedAt)
  const staleAfterMs = input.staleAfterMs ?? 300_000
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) throw new Error('invalid cluster alert stale boundary')
  const seen = new Set<string>()
  const items = [...input.records].sort((a, b) => a.alertId.localeCompare(b.alertId)).map(record => {
    if (record.clusterId !== input.clusterId) throw new Error('cluster alert diagnostics record mismatch')
    if (seen.has(record.alertId)) throw new Error('duplicate cluster alert lifecycle record')
    seen.add(record.alertId)
    const lastDetectedAt = iso(record.lastDetectedAt)
    const stale = record.state !== 'resolved' && generatedAtMs - Date.parse(lastDetectedAt) >= staleAfterMs
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-alert-diagnostic-item-v1' as const,
      alertId: record.alertId,
      instructionId: record.instructionId,
      kind: record.kind,
      severity: record.severity,
      state: record.state,
      recurring: record.occurrenceCount > 1,
      stale,
      occurrenceCount: record.occurrenceCount,
      firstDetectedAt: iso(record.firstDetectedAt),
      lastDetectedAt,
      acknowledgedAt: record.acknowledgedAt ? iso(record.acknowledgedAt) : null,
      acknowledgedBy: record.acknowledgedBy ?? null,
      resolvedAt: record.resolvedAt ? iso(record.resolvedAt) : null,
      resolutionReason: record.resolutionReason ?? null,
      readOnly: true as const,
      automaticRemediationEnabled: false as const,
      executable: false as const,
    })
  })
  const activeAlerts = items.filter(item => item.state === 'open').length
  const acknowledgedAlerts = items.filter(item => item.state === 'acknowledged').length
  const resolvedAlerts = items.filter(item => item.state === 'resolved').length
  const recurringAlerts = items.filter(item => item.recurring).length
  const staleAlerts = items.filter(item => item.stale).length
  const warningAlerts = items.filter(item => item.severity === 'warning' && item.state !== 'resolved').length
  const criticalAlerts = items.filter(item => item.severity === 'critical' && item.state !== 'resolved').length
  const status: ClusterAlertDiagnosticStatus = criticalAlerts > 0 || staleAlerts > 0 ? 'critical' : warningAlerts > 0 || activeAlerts > 0 || acknowledgedAlerts > 0 ? 'degraded' : items.length === 0 ? 'unknown' : 'healthy'
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-alert-diagnostics-v1',
    clusterId: input.clusterId,
    generatedAt,
    status,
    totalAlerts: items.length,
    activeAlerts,
    acknowledgedAlerts,
    resolvedAlerts,
    recurringAlerts,
    staleAlerts,
    warningAlerts,
    criticalAlerts,
    items: Object.freeze(items),
    safety: Object.freeze({ readOnly: true, remediationControlsExposed: false, automaticRemediationEnabled: false }),
    executable: false,
  })
}
