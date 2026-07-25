// saas/agent-gateway/cluster-alert-escalation.ts
//
// Deterministic, non-executable escalation planning for cluster alert diagnostics.
// This module sends no notifications and performs no remediation.

import type { ClusterAlertDiagnosticItem, ClusterAlertDiagnosticsSnapshot } from './cluster-alert-diagnostics.ts'

export type ClusterAlertEscalationLevel = 'observe' | 'operator' | 'incident' | 'executive'

export interface ClusterAlertEscalationPolicy {
  operatorAfterMs: number
  incidentAfterMs: number
  executiveAfterMs: number
  incidentRecurrenceThreshold: number
  executiveRecurrenceThreshold: number
}

export interface ClusterAlertEscalationRecommendation {
  schemaVersion: 'agent-gateway-cluster-alert-escalation-recommendation-v1'
  recommendationId: string
  alertId: string
  clusterId: string
  level: ClusterAlertEscalationLevel
  reason: string
  generatedAt: string
  requiresHumanAction: boolean
  notificationSent: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterAlertEscalationPlan {
  schemaVersion: 'agent-gateway-cluster-alert-escalation-plan-v1'
  clusterId: string
  generatedAt: string
  recommendations: readonly ClusterAlertEscalationRecommendation[]
  counts: Readonly<Record<ClusterAlertEscalationLevel, number>>
  highestLevel: ClusterAlertEscalationLevel | null
  notificationsEnabled: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

const DEFAULT_POLICY: ClusterAlertEscalationPolicy = Object.freeze({ operatorAfterMs: 60_000, incidentAfterMs: 300_000, executiveAfterMs: 900_000, incidentRecurrenceThreshold: 3, executiveRecurrenceThreshold: 5 })

function time(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster alert escalation timestamp')
  return parsed
}

function validate(policy: ClusterAlertEscalationPolicy): void {
  if (![policy.operatorAfterMs, policy.incidentAfterMs, policy.executiveAfterMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('invalid cluster alert escalation age boundary')
  if (!(policy.operatorAfterMs <= policy.incidentAfterMs && policy.incidentAfterMs <= policy.executiveAfterMs)) throw new Error('invalid cluster alert escalation boundary order')
  if (!Number.isSafeInteger(policy.incidentRecurrenceThreshold) || policy.incidentRecurrenceThreshold < 2) throw new Error('invalid cluster alert incident recurrence threshold')
  if (!Number.isSafeInteger(policy.executiveRecurrenceThreshold) || policy.executiveRecurrenceThreshold < policy.incidentRecurrenceThreshold) throw new Error('invalid cluster alert executive recurrence threshold')
}

function levelFor(item: ClusterAlertDiagnosticItem, age: number, policy: ClusterAlertEscalationPolicy): ClusterAlertEscalationLevel | null {
  if (item.state === 'resolved') return null
  if (item.severity === 'critical' && (item.stale || age >= policy.executiveAfterMs || item.occurrenceCount >= policy.executiveRecurrenceThreshold)) return 'executive'
  if (item.severity === 'critical' || item.stale || age >= policy.incidentAfterMs || item.occurrenceCount >= policy.incidentRecurrenceThreshold) return 'incident'
  if (item.severity === 'warning' || item.state === 'open' || age >= policy.operatorAfterMs) return 'operator'
  return 'observe'
}

function reasonFor(item: ClusterAlertDiagnosticItem, level: ClusterAlertEscalationLevel): string {
  const reasons: string[] = []
  if (item.severity === 'critical') reasons.push('critical severity')
  if (item.stale) reasons.push('stale active alert')
  if (item.recurring) reasons.push(`recurring ${item.occurrenceCount} times`)
  if (item.state === 'open') reasons.push('not acknowledged')
  if (item.state === 'acknowledged') reasons.push('acknowledged but unresolved')
  return `${level} escalation recommended: ${reasons.join(', ') || 'active alert requires observation'}`
}

export function planClusterAlertEscalations(input: { diagnostics: ClusterAlertDiagnosticsSnapshot; policy?: Partial<ClusterAlertEscalationPolicy> }): ClusterAlertEscalationPlan {
  if (!input.diagnostics || input.diagnostics.schemaVersion !== 'agent-gateway-cluster-alert-diagnostics-v1') throw new Error('invalid cluster alert diagnostics')
  const generatedAtMs = time(input.diagnostics.generatedAt)
  const policy: ClusterAlertEscalationPolicy = Object.freeze({ ...DEFAULT_POLICY, ...input.policy })
  validate(policy)
  const recommendations = input.diagnostics.items.flatMap(item => {
    const age = Math.max(0, generatedAtMs - time(item.lastDetectedAt))
    const level = levelFor(item, age, policy)
    if (!level) return []
    return [Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-escalation-recommendation-v1' as const, recommendationId: `${item.alertId}:${level}`, alertId: item.alertId, clusterId: input.diagnostics.clusterId, level, reason: reasonFor(item, level), generatedAt: input.diagnostics.generatedAt, requiresHumanAction: level !== 'observe', notificationSent: false as const, automaticRemediationEnabled: false as const, readOnly: true as const, executable: false as const })]
  }).sort((a, b) => a.alertId.localeCompare(b.alertId) || a.level.localeCompare(b.level))
  const counts: Record<ClusterAlertEscalationLevel, number> = { observe: 0, operator: 0, incident: 0, executive: 0 }
  for (const item of recommendations) counts[item.level] += 1
  const highestLevel: ClusterAlertEscalationLevel | null = counts.executive ? 'executive' : counts.incident ? 'incident' : counts.operator ? 'operator' : counts.observe ? 'observe' : null
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-escalation-plan-v1', clusterId: input.diagnostics.clusterId, generatedAt: input.diagnostics.generatedAt, recommendations: Object.freeze(recommendations), counts: Object.freeze(counts), highestLevel, notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false })
}
