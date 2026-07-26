// saas/lib/enterprise/operations/operationsIntelligence.ts
// Read-only aggregation contract for the Enterprise Operations Intelligence dashboard.
// This module summarizes existing evidence-driven outputs; it never mutates incidents, executes repairs, or changes approvals.

import type { ClosedLoopVerificationResult } from '../memory/closedLoopVerification.ts'
import type { EnterprisePlaybookRegistry, PlaybookStatus } from '../memory/playbookIntelligence.ts'
import type { OrganizationalRepairLearning } from '../memory/organizationalLearning.ts'

export type OperationsIncident = Readonly<{
  incidentId: string
  organizationId: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'repair_pending' | 'verification_pending' | 'closure_pending' | 'resolved'
  openedAt: string
  updatedAt: string
}>

export type OperationsIntelligenceSnapshot = Readonly<{
  organizationId: string
  generatedAt: string
  health: Readonly<{
    score: number
    state: 'green' | 'yellow' | 'red'
  }>
  incidents: Readonly<{
    total: number
    open: number
    critical: number
    awaitingVerification: number
    awaitingClosureApproval: number
    resolved: number
  }>
  verification: Readonly<{
    completed: number
    verified: number
    failed: number
    inconclusive: number
    successRate: number
    averageConfidence: number
  }>
  learning: Readonly<{
    acceptedSamples: number
    ignoredOutcomes: number
    strategies: number
    averageRecommendationConfidence: number
  }>
  playbooks: Readonly<Record<PlaybookStatus | 'total', number>>
  recentIncidentIds: readonly string[]
}>

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} timestamp: ${value}`)
  return parsed
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function buildOperationsIntelligenceSnapshot(input: Readonly<{
  organizationId: string
  incidents: readonly OperationsIncident[]
  verifications: readonly ClosedLoopVerificationResult[]
  learning: OrganizationalRepairLearning
  playbooks: EnterprisePlaybookRegistry
  generatedAt?: string
}>): OperationsIntelligenceSnapshot {
  const organizationId = input.organizationId.trim()
  if (!organizationId) throw new Error('Operations intelligence requires organizationId.')
  if (input.learning.organizationId !== organizationId) throw new Error('Operations intelligence learning organization mismatch.')
  if (input.playbooks.organizationId !== organizationId) throw new Error('Operations intelligence playbook organization mismatch.')

  const generatedAtMs = timestamp(input.generatedAt || new Date().toISOString(), 'operations intelligence generatedAt')
  const generatedAt = new Date(generatedAtMs).toISOString()
  const incidents = input.incidents.filter(item => item.organizationId === organizationId)
  const verifications = input.verifications.filter(item => item.organizationId === organizationId)

  for (const incident of incidents) {
    if (!incident.incidentId.trim()) throw new Error('Operations incidents require incidentId.')
    timestamp(incident.openedAt, 'incident openedAt')
    timestamp(incident.updatedAt, 'incident updatedAt')
  }

  const open = incidents.filter(item => item.status !== 'resolved')
  const critical = open.filter(item => item.severity === 'critical')
  const awaitingVerification = open.filter(item => item.status === 'verification_pending')
  const awaitingClosureApproval = open.filter(item => item.status === 'closure_pending')
  const resolved = incidents.filter(item => item.status === 'resolved')

  const verified = verifications.filter(item => item.status === 'verified')
  const failed = verifications.filter(item => item.status === 'failed')
  const inconclusive = verifications.filter(item => item.status === 'inconclusive')
  const completed = verified.length + failed.length
  const successRate = completed ? verified.length / completed : 0
  const averageConfidence = average(verifications.map(item => Math.min(1, Math.max(0, Number(item.confidence) || 0))))

  const strategyConfidences = input.learning.strategies.map(item => Math.min(1, Math.max(0, item.recommendationConfidence)))
  const currentPlaybooks = input.playbooks.current
  const countStatus = (status: PlaybookStatus) => currentPlaybooks.filter(item => item.status === status).length

  // Health penalizes unresolved severity, failed verification, and missing evidence. Trusted playbooks provide only a small supporting boost.
  const incidentPenalty = Math.min(55, critical.length * 20 + open.filter(item => item.severity === 'high').length * 10 + open.filter(item => item.severity === 'medium').length * 5 + open.filter(item => item.severity === 'low').length * 2)
  const verificationPenalty = Math.min(30, failed.length * 12 + inconclusive.length * 4)
  const trustedBoost = Math.min(5, countStatus('trusted'))
  const score = Math.max(0, Math.min(100, Math.round(100 - incidentPenalty - verificationPenalty + trustedBoost)))
  const state = score >= 90 ? 'green' : score >= 70 ? 'yellow' : 'red'

  const recentIncidentIds = incidents
    .slice()
    .sort((a, b) => timestamp(b.updatedAt, 'incident updatedAt') - timestamp(a.updatedAt, 'incident updatedAt') || a.incidentId.localeCompare(b.incidentId))
    .slice(0, 10)
    .map(item => item.incidentId)

  return Object.freeze({
    organizationId,
    generatedAt,
    health: Object.freeze({ score, state }),
    incidents: Object.freeze({
      total: incidents.length,
      open: open.length,
      critical: critical.length,
      awaitingVerification: awaitingVerification.length,
      awaitingClosureApproval: awaitingClosureApproval.length,
      resolved: resolved.length,
    }),
    verification: Object.freeze({
      completed,
      verified: verified.length,
      failed: failed.length,
      inconclusive: inconclusive.length,
      successRate: round(successRate),
      averageConfidence: round(averageConfidence),
    }),
    learning: Object.freeze({
      acceptedSamples: input.learning.acceptedSamples.length,
      ignoredOutcomes: input.learning.ignoredOutcomeCount,
      strategies: input.learning.strategies.length,
      averageRecommendationConfidence: round(average(strategyConfidences)),
    }),
    playbooks: Object.freeze({
      total: currentPlaybooks.length,
      candidate: countStatus('candidate'),
      recommended: countStatus('recommended'),
      trusted: countStatus('trusted'),
      deprecated: countStatus('deprecated'),
    }),
    recentIncidentIds: Object.freeze(recentIncidentIds),
  })
}
