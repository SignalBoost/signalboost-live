// saas/agent-gateway/cluster-delivery-alerts.ts
//
// Deterministic, read-only alert evaluation for cluster instruction delivery diagnostics.
// This module never retries delivery, acknowledges receipts, or repairs infrastructure.

import type {
  ClusterDeliveryDiagnosticItem,
  ClusterDeliveryDiagnosticsSnapshot,
} from './cluster-delivery-diagnostics.ts'

export type ClusterDeliveryAlertSeverity = 'info' | 'warning' | 'critical'
export type ClusterDeliveryAlertKind =
  | 'stalled-dispatch'
  | 'repeated-retry'
  | 'stale-term'
  | 'rejected-outcome'
  | 'expired-outcome'
  | 'missing-acknowledgment'

export interface ClusterDeliveryAlertPolicy {
  stalledAfterMs: number
  missingAcknowledgmentAfterMs: number
  repeatedRetryThreshold: number
}

export interface ClusterDeliveryAlert {
  schemaVersion: 'agent-gateway-cluster-delivery-alert-v1'
  alertId: string
  clusterId: string
  instructionId: string
  runtimeId: string | null
  term: number
  kind: ClusterDeliveryAlertKind
  severity: ClusterDeliveryAlertSeverity
  detectedAt: string
  reason: string
  attempt: number
  requiresHumanReview: boolean
  automaticRepairEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterDeliveryAlertEvaluation {
  schemaVersion: 'agent-gateway-cluster-delivery-alert-evaluation-v1'
  clusterId: string
  generatedAt: string
  alerts: readonly ClusterDeliveryAlert[]
  counts: Readonly<Record<ClusterDeliveryAlertSeverity, number>>
  highestSeverity: ClusterDeliveryAlertSeverity | null
  automaticRepairEnabled: false
  readOnly: true
  executable: false
}

const DEFAULT_POLICY: ClusterDeliveryAlertPolicy = Object.freeze({
  stalledAfterMs: 120_000,
  missingAcknowledgmentAfterMs: 60_000,
  repeatedRetryThreshold: 3,
})

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster delivery alert timestamp')
  return parsed
}

function validatePolicy(policy: ClusterDeliveryAlertPolicy): void {
  if (!Number.isSafeInteger(policy.stalledAfterMs) || policy.stalledAfterMs < 1) throw new Error('invalid stalled alert boundary')
  if (!Number.isSafeInteger(policy.missingAcknowledgmentAfterMs) || policy.missingAcknowledgmentAfterMs < 1) throw new Error('invalid acknowledgment alert boundary')
  if (!Number.isSafeInteger(policy.repeatedRetryThreshold) || policy.repeatedRetryThreshold < 2) throw new Error('invalid repeated retry threshold')
}

function alert(input: {
  item: ClusterDeliveryDiagnosticItem
  generatedAt: string
  kind: ClusterDeliveryAlertKind
  severity: ClusterDeliveryAlertSeverity
  reason: string
  requiresHumanReview?: boolean
}): ClusterDeliveryAlert {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-alert-v1',
    alertId: `${input.item.instructionId}:${input.kind}`,
    clusterId: input.item.clusterId,
    instructionId: input.item.instructionId,
    runtimeId: input.item.runtimeId,
    term: input.item.term,
    kind: input.kind,
    severity: input.severity,
    detectedAt: input.generatedAt,
    reason: input.reason,
    attempt: input.item.attempt,
    requiresHumanReview: input.requiresHumanReview ?? input.severity === 'critical',
    automaticRepairEnabled: false,
    readOnly: true,
    executable: false,
  })
}

function evaluateItem(
  item: ClusterDeliveryDiagnosticItem,
  generatedAt: string,
  nowMs: number,
  policy: ClusterDeliveryAlertPolicy,
): ClusterDeliveryAlert[] {
  const alerts: ClusterDeliveryAlert[] = []
  if (item.state === 'stale-term') {
    alerts.push(alert({ item, generatedAt, kind: 'stale-term', severity: 'critical', reason: 'instruction term is older than the active cluster term' }))
  }
  if (item.terminalReceiptState === 'rejected') {
    alerts.push(alert({ item, generatedAt, kind: 'rejected-outcome', severity: 'critical', reason: 'governed runtime rejected the staged instruction', requiresHumanReview: true }))
  } else if (item.terminalReceiptState === 'expired') {
    alerts.push(alert({ item, generatedAt, kind: 'expired-outcome', severity: 'warning', reason: 'runtime instruction expired before a verified outcome was recorded' }))
  }
  if (item.attempt >= policy.repeatedRetryThreshold && item.state === 'retrying') {
    alerts.push(alert({ item, generatedAt, kind: 'repeated-retry', severity: 'warning', reason: `instruction has reached ${item.attempt} delivery attempts` }))
  }
  if (item.lastDispatchedAt && (item.state === 'dispatched' || item.state === 'retrying')) {
    const age = nowMs - timestamp(item.lastDispatchedAt)
    if (age >= policy.stalledAfterMs) {
      alerts.push(alert({ item, generatedAt, kind: 'stalled-dispatch', severity: 'warning', reason: 'dispatch remains incomplete beyond the stalled-delivery boundary' }))
    }
    if (!item.acknowledgedAt && age >= policy.missingAcknowledgmentAfterMs) {
      alerts.push(alert({ item, generatedAt, kind: 'missing-acknowledgment', severity: 'warning', reason: 'runtime acknowledgment is missing beyond the configured grace period' }))
    }
  }
  return alerts
}

export function evaluateClusterDeliveryAlerts(input: {
  diagnostics: ClusterDeliveryDiagnosticsSnapshot
  policy?: Partial<ClusterDeliveryAlertPolicy>
}): ClusterDeliveryAlertEvaluation {
  if (!input.diagnostics || input.diagnostics.schemaVersion !== 'agent-gateway-cluster-delivery-diagnostics-v1') throw new Error('invalid cluster delivery diagnostics')
  const generatedAtMs = timestamp(input.diagnostics.generatedAt)
  const policy: ClusterDeliveryAlertPolicy = Object.freeze({ ...DEFAULT_POLICY, ...input.policy })
  validatePolicy(policy)
  const alerts = input.diagnostics.items
    .flatMap(item => evaluateItem(item, input.diagnostics.generatedAt, generatedAtMs, policy))
    .sort((a, b) => a.instructionId.localeCompare(b.instructionId) || a.kind.localeCompare(b.kind))
  const counts: Record<ClusterDeliveryAlertSeverity, number> = { info: 0, warning: 0, critical: 0 }
  for (const item of alerts) counts[item.severity] += 1
  const highestSeverity: ClusterDeliveryAlertSeverity | null = counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : counts.info > 0 ? 'info' : null
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-alert-evaluation-v1',
    clusterId: input.diagnostics.clusterId,
    generatedAt: input.diagnostics.generatedAt,
    alerts: Object.freeze(alerts),
    counts: Object.freeze(counts),
    highestSeverity,
    automaticRepairEnabled: false,
    readOnly: true,
    executable: false,
  })
}
