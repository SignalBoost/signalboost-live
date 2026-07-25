// saas/agent-gateway/cluster-runtime-health.ts
//
// Read-only health aggregation over cluster delivery diagnostics and alert evaluations.
// This module exposes no runtime execution, retry, acknowledgment, or repair controls.

import type { ClusterDeliveryAlertEvaluation } from './cluster-delivery-alerts.ts'
import type { ClusterDeliveryDiagnosticsSnapshot } from './cluster-delivery-diagnostics.ts'

export type ClusterRuntimeHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface ClusterRuntimeHealthSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-health-v1'
  generatedAt: string
  clusterId: string
  currentTerm: number
  status: ClusterRuntimeHealthStatus
  summary: Readonly<{
    totalInstructions: number
    pendingAcknowledgments: number
    verifiedOrCompleted: number
    retryRecommendations: number
    terminalOutcomes: number
    staleTerms: number
    warningAlerts: number
    criticalAlerts: number
    humanReviewRequired: number
  }>
  reasons: readonly string[]
  safety: Readonly<{
    readOnly: true
    automaticRetryEnabled: false
    automaticRepairEnabled: false
    infrastructureMutationEnabled: false
    runtimeExecutionControlsExposed: false
  }>
  executable: false
}

function iso(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster runtime health timestamp')
  return new Date(parsed).toISOString()
}

export function createClusterRuntimeHealth(input: {
  diagnostics: ClusterDeliveryDiagnosticsSnapshot
  alerts: ClusterDeliveryAlertEvaluation
}): ClusterRuntimeHealthSnapshot {
  const diagnostics = input.diagnostics
  const alerts = input.alerts
  if (!diagnostics || diagnostics.schemaVersion !== 'agent-gateway-cluster-delivery-diagnostics-v1') throw new Error('invalid cluster runtime health diagnostics')
  if (!alerts || alerts.schemaVersion !== 'agent-gateway-cluster-delivery-alert-evaluation-v1') throw new Error('invalid cluster runtime health alerts')
  if (diagnostics.clusterId !== alerts.clusterId) throw new Error('cluster runtime health identity mismatch')
  if (iso(diagnostics.generatedAt) !== iso(alerts.generatedAt)) throw new Error('cluster runtime health observation mismatch')
  if (diagnostics.safety.infrastructureMutationEnabled !== false || diagnostics.executable !== false) throw new Error('unsafe cluster runtime diagnostics')
  if (alerts.automaticRepairEnabled !== false || alerts.executable !== false) throw new Error('unsafe cluster runtime alerts')

  const pendingAcknowledgments = diagnostics.counts.staged + diagnostics.counts.dispatched + diagnostics.counts.retrying
  const verifiedOrCompleted = diagnostics.counts.acknowledged
  const retryRecommendations = diagnostics.retryRequired
  const terminalOutcomes = diagnostics.counts.terminal
  const staleTerms = diagnostics.staleTermCount
  const humanReviewRequired = alerts.alerts.filter(alert => alert.requiresHumanReview).length
  const reasons = new Set<string>()
  if (staleTerms > 0) reasons.add('stale cluster terms require operator review')
  if (alerts.counts.critical > 0) reasons.add('critical delivery alerts are active')
  if (terminalOutcomes > 0) reasons.add('terminal runtime outcomes require inspection')
  if (retryRecommendations > 0) reasons.add('delivery retry recommendations are pending')
  if (pendingAcknowledgments > 0) reasons.add('runtime acknowledgments remain pending')

  const status: ClusterRuntimeHealthStatus =
    staleTerms > 0 || alerts.counts.critical > 0 ? 'critical'
      : terminalOutcomes > 0 || retryRecommendations > 0 || alerts.counts.warning > 0 ? 'warning'
        : pendingAcknowledgments > 0 ? 'unknown'
          : 'healthy'

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-v1',
    generatedAt: iso(diagnostics.generatedAt),
    clusterId: diagnostics.clusterId,
    currentTerm: diagnostics.currentTerm,
    status,
    summary: Object.freeze({
      totalInstructions: diagnostics.totalInstructions,
      pendingAcknowledgments,
      verifiedOrCompleted,
      retryRecommendations,
      terminalOutcomes,
      staleTerms,
      warningAlerts: alerts.counts.warning,
      criticalAlerts: alerts.counts.critical,
      humanReviewRequired,
    }),
    reasons: Object.freeze([...reasons].sort()),
    safety: Object.freeze({
      readOnly: true,
      automaticRetryEnabled: false,
      automaticRepairEnabled: false,
      infrastructureMutationEnabled: false,
      runtimeExecutionControlsExposed: false,
    }),
    executable: false,
  })
}
