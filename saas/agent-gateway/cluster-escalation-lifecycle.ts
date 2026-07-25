// saas/agent-gateway/cluster-escalation-lifecycle.ts
//
// Durable workflow state for non-executable cluster escalation recommendations.
// This module sends no notifications and performs no remediation.

import type { ClusterAlertEscalationPlan, ClusterAlertEscalationRecommendation } from './cluster-alert-escalation.ts'

export type ClusterEscalationLifecycleState = 'open' | 'acknowledged' | 'closed' | 'expired'

export interface ClusterEscalationLifecycleRecord {
  schemaVersion: 'agent-gateway-cluster-escalation-lifecycle-v1'
  recommendationId: string
  alertId: string
  clusterId: string
  level: ClusterAlertEscalationRecommendation['level']
  state: ClusterEscalationLifecycleState
  firstRecommendedAt: string
  lastRecommendedAt: string
  occurrenceCount: number
  acknowledgedAt?: string
  acknowledgedBy?: string
  closedAt?: string
  closureReason?: string
  expiredAt?: string
  notificationsEnabled: false
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterEscalationLifecycleStore {
  get(recommendationId: string): Promise<ClusterEscalationLifecycleRecord | null>
  listByCluster(clusterId: string): Promise<readonly ClusterEscalationLifecycleRecord[]>
  compareAndSet(recommendationId: string, expectedOccurrenceCount: number, next: ClusterEscalationLifecycleRecord): Promise<boolean>
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/
function required(value: string, field: string): string { const normalized = String(value || '').trim(); if (!ID.test(normalized)) throw new Error(`invalid cluster escalation lifecycle ${field}`); return normalized }
function iso(value: string | Date): string { const parsed = value instanceof Date ? value.getTime() : Date.parse(value); if (!Number.isFinite(parsed)) throw new Error('invalid cluster escalation lifecycle timestamp'); return new Date(parsed).toISOString() }
function openRecord(item: ClusterAlertEscalationRecommendation): ClusterEscalationLifecycleRecord {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-escalation-lifecycle-v1', recommendationId: item.recommendationId, alertId: item.alertId, clusterId: item.clusterId, level: item.level, state: 'open', firstRecommendedAt: iso(item.generatedAt), lastRecommendedAt: iso(item.generatedAt), occurrenceCount: 1, notificationsEnabled: false, automaticRemediationEnabled: false, readOnly: true, executable: false })
}

export class ClusterEscalationLifecycleController {
  private readonly store: ClusterEscalationLifecycleStore
  constructor(store: ClusterEscalationLifecycleStore) { this.store = store }

  async ingest(plan: ClusterAlertEscalationPlan): Promise<readonly ClusterEscalationLifecycleRecord[]> {
    if (!plan || plan.schemaVersion !== 'agent-gateway-cluster-alert-escalation-plan-v1') throw new Error('invalid cluster escalation plan')
    const records: ClusterEscalationLifecycleRecord[] = []
    for (const item of plan.recommendations) {
      const current = await this.store.get(item.recommendationId)
      if (!current) {
        const next = openRecord(item)
        if (!(await this.store.compareAndSet(item.recommendationId, 0, next))) throw new Error('cluster escalation lifecycle changed concurrently')
        records.push(next)
        continue
      }
      if (current.clusterId !== item.clusterId || current.alertId !== item.alertId) throw new Error('cluster escalation lifecycle identity conflict')
      const next: ClusterEscalationLifecycleRecord = Object.freeze({ ...current, level: item.level, state: current.state === 'closed' || current.state === 'expired' ? 'open' : current.state, lastRecommendedAt: iso(item.generatedAt), occurrenceCount: current.occurrenceCount + 1, ...(current.state === 'closed' || current.state === 'expired' ? { acknowledgedAt: undefined, acknowledgedBy: undefined, closedAt: undefined, closureReason: undefined, expiredAt: undefined } : {}) })
      if (!(await this.store.compareAndSet(item.recommendationId, current.occurrenceCount, next))) throw new Error('cluster escalation recurrence changed concurrently')
      records.push(next)
    }
    return Object.freeze(records.sort((a, b) => a.recommendationId.localeCompare(b.recommendationId)))
  }

  async acknowledge(recommendationIdInput: string, actorInput: string, at = new Date()): Promise<ClusterEscalationLifecycleRecord> {
    const recommendationId = required(recommendationIdInput, 'recommendationId'); const actor = required(actorInput, 'actor'); const current = await this.store.get(recommendationId)
    if (!current) throw new Error('cluster escalation lifecycle record not found')
    if (current.state !== 'open') return current
    const next = Object.freeze({ ...current, state: 'acknowledged' as const, acknowledgedAt: iso(at), acknowledgedBy: actor })
    if (!(await this.store.compareAndSet(recommendationId, current.occurrenceCount, next))) throw new Error('cluster escalation acknowledgment changed concurrently')
    return next
  }

  async close(recommendationIdInput: string, reasonInput: string, at = new Date()): Promise<ClusterEscalationLifecycleRecord> {
    const recommendationId = required(recommendationIdInput, 'recommendationId'); const reason = String(reasonInput || '').trim(); if (!reason) throw new Error('invalid cluster escalation closure reason'); const current = await this.store.get(recommendationId)
    if (!current) throw new Error('cluster escalation lifecycle record not found')
    if (current.state === 'closed') return current
    const next = Object.freeze({ ...current, state: 'closed' as const, closedAt: iso(at), closureReason: reason.slice(0, 500) })
    if (!(await this.store.compareAndSet(recommendationId, current.occurrenceCount, next))) throw new Error('cluster escalation closure changed concurrently')
    return next
  }

  async expire(clusterIdInput: string, activeRecommendationIds: readonly string[], at = new Date()): Promise<readonly ClusterEscalationLifecycleRecord[]> {
    const clusterId = required(clusterIdInput, 'clusterId'); const active = new Set(activeRecommendationIds.map(id => required(id, 'activeRecommendationId'))); const expired: ClusterEscalationLifecycleRecord[] = []
    for (const current of await this.store.listByCluster(clusterId)) {
      if (active.has(current.recommendationId) || current.state === 'closed' || current.state === 'expired') continue
      const next = Object.freeze({ ...current, state: 'expired' as const, expiredAt: iso(at) })
      if (!(await this.store.compareAndSet(current.recommendationId, current.occurrenceCount, next))) throw new Error('cluster escalation expiration changed concurrently')
      expired.push(next)
    }
    return Object.freeze(expired.sort((a, b) => a.recommendationId.localeCompare(b.recommendationId)))
  }
}

export class InMemoryClusterEscalationLifecycleStore implements ClusterEscalationLifecycleStore {
  private readonly records = new Map<string, ClusterEscalationLifecycleRecord>()
  async get(recommendationId: string): Promise<ClusterEscalationLifecycleRecord | null> { return this.records.get(recommendationId) ?? null }
  async listByCluster(clusterId: string): Promise<readonly ClusterEscalationLifecycleRecord[]> { return Object.freeze([...this.records.values()].filter(item => item.clusterId === clusterId).sort((a, b) => a.recommendationId.localeCompare(b.recommendationId))) }
  async compareAndSet(recommendationId: string, expectedOccurrenceCount: number, next: ClusterEscalationLifecycleRecord): Promise<boolean> { const current = this.records.get(recommendationId); if ((current?.occurrenceCount ?? 0) !== expectedOccurrenceCount) return false; this.records.set(recommendationId, next); return true }
}
