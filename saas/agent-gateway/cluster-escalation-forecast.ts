// saas/agent-gateway/cluster-escalation-forecast.ts
//
// Deterministic, read-only near-term forecasting for cluster escalation pressure.
// This module makes no automated decisions, sends no notifications, and performs no remediation.

import type { ClusterEscalationTrendAnalysis, ClusterEscalationTrendPoint } from './cluster-escalation-trends.ts'

export type ClusterEscalationForecastDirection = 'rising' | 'stable' | 'declining' | 'unknown'
export type ClusterEscalationForecastRisk = 'low' | 'moderate' | 'high' | 'critical' | 'unknown'

export interface ClusterEscalationForecastPolicy {
  horizonSteps: number
  stableDelta: number
  highPressureThreshold: number
  criticalPressureThreshold: number
}

export interface ClusterEscalationForecast {
  schemaVersion: 'agent-gateway-cluster-escalation-forecast-v1'
  clusterId: string
  generatedAt: string
  direction: ClusterEscalationForecastDirection
  risk: ClusterEscalationForecastRisk
  currentPressureScore: number
  projectedPressureScore: number
  projectedDelta: number
  horizonSteps: number
  confidence: 'low' | 'medium' | 'high'
  recurringPressureExpected: boolean
  incidentPressureExpected: boolean
  executivePressureExpected: boolean
  automatedDecisionEnabled: false
  notificationsEnabled: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

const DEFAULT_POLICY: ClusterEscalationForecastPolicy = Object.freeze({ horizonSteps: 1, stableDelta: 1, highPressureThreshold: 12, criticalPressureThreshold: 24 })

function validate(policy: ClusterEscalationForecastPolicy): void {
  if (!Number.isSafeInteger(policy.horizonSteps) || policy.horizonSteps < 1 || policy.horizonSteps > 12) throw new Error('invalid cluster escalation forecast horizon')
  if (!Number.isSafeInteger(policy.stableDelta) || policy.stableDelta < 0) throw new Error('invalid cluster escalation forecast stable delta')
  if (!Number.isSafeInteger(policy.highPressureThreshold) || policy.highPressureThreshold < 1) throw new Error('invalid cluster escalation forecast high threshold')
  if (!Number.isSafeInteger(policy.criticalPressureThreshold) || policy.criticalPressureThreshold < policy.highPressureThreshold) throw new Error('invalid cluster escalation forecast critical threshold')
}

function slope(points: readonly ClusterEscalationTrendPoint[]): number {
  if (points.length < 2) return 0
  const recent = points.slice(-3)
  let total = 0
  for (let index = 1; index < recent.length; index += 1) total += recent[index].pressureScore - recent[index - 1].pressureScore
  return total / (recent.length - 1)
}

export function evaluateClusterEscalationForecast(input: { analysis: ClusterEscalationTrendAnalysis; policy?: Partial<ClusterEscalationForecastPolicy> }): ClusterEscalationForecast {
  if (!input.analysis || input.analysis.schemaVersion !== 'agent-gateway-cluster-escalation-trend-analysis-v1') throw new Error('invalid cluster escalation trend analysis')
  const policy: ClusterEscalationForecastPolicy = Object.freeze({ ...DEFAULT_POLICY, ...input.policy })
  validate(policy)
  const points = input.analysis.points
  const current = points.at(-1)?.pressureScore ?? 0
  const projectedDelta = Math.round(slope(points) * policy.horizonSteps)
  const projectedPressureScore = Math.max(0, current + projectedDelta)
  const direction: ClusterEscalationForecastDirection = points.length < 2 ? 'unknown' : Math.abs(projectedDelta) <= policy.stableDelta ? 'stable' : projectedDelta > 0 ? 'rising' : 'declining'
  const risk: ClusterEscalationForecastRisk = points.length === 0 ? 'unknown' : projectedPressureScore >= policy.criticalPressureThreshold ? 'critical' : projectedPressureScore >= policy.highPressureThreshold ? 'high' : projectedPressureScore > 0 ? 'moderate' : 'low'
  const confidence = points.length >= 3 ? 'high' : points.length === 2 ? 'medium' : 'low'
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-escalation-forecast-v1', clusterId: input.analysis.clusterId, generatedAt: input.analysis.generatedAt,
    direction, risk, currentPressureScore: current, projectedPressureScore, projectedDelta, horizonSteps: policy.horizonSteps, confidence,
    recurringPressureExpected: input.analysis.recurringPressure && projectedPressureScore > 0,
    incidentPressureExpected: input.analysis.incidentPressure && projectedPressureScore >= policy.highPressureThreshold,
    executivePressureExpected: input.analysis.executivePressure && projectedPressureScore >= policy.criticalPressureThreshold,
    automatedDecisionEnabled: false, notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false,
  })
}
