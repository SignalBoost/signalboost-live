// saas/agent-gateway/cluster-alert-lifecycle.ts
//
// Durable, host-neutral lifecycle state for cluster delivery alerts.
// This module tracks operator workflow only and never performs remediation.

import type { ClusterDeliveryAlert, ClusterDeliveryAlertEvaluation } from './cluster-delivery-alerts.ts'

export type ClusterAlertLifecycleState = 'open' | 'acknowledged' | 'resolved'

export interface ClusterAlertLifecycleRecord {
  schemaVersion: 'agent-gateway-cluster-alert-lifecycle-v1'
  alertId: string
  clusterId: string
  instructionId: string
  kind: ClusterDeliveryAlert['kind']
  severity: ClusterDeliveryAlert['severity']
  state: ClusterAlertLifecycleState
  firstDetectedAt: string
  lastDetectedAt: string
  occurrenceCount: number
  acknowledgedAt?: string
  acknowledgedBy?: string
  resolvedAt?: string
  resolutionReason?: string
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterAlertLifecycleStore {
  get(alertId: string): Promise<ClusterAlertLifecycleRecord | null>
  listByCluster(clusterId: string): Promise<readonly ClusterAlertLifecycleRecord[]>
  compareAndSet(alertId: string, expectedOccurrenceCount: number, next: ClusterAlertLifecycleRecord): Promise<boolean>
}

export interface ClusterAlertCleanupResult {
  schemaVersion: 'agent-gateway-cluster-alert-cleanup-v1'
  clusterId: string
  resolvedAlertIds: readonly string[]
  retainedAlertIds: readonly string[]
  automaticRemediationEnabled: false
  readOnly: true
  executable: false
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/
function required(value: string, field: string): string {
  const normalized = String(value || '').trim()
  if (!ID.test(normalized)) throw new Error(`invalid cluster alert lifecycle ${field}`)
  return normalized
}
function iso(value: string | Date): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster alert lifecycle timestamp')
  return new Date(parsed).toISOString()
}

function openRecord(alert: ClusterDeliveryAlert): ClusterAlertLifecycleRecord {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-alert-lifecycle-v1',
    alertId: alert.alertId,
    clusterId: alert.clusterId,
    instructionId: alert.instructionId,
    kind: alert.kind,
    severity: alert.severity,
    state: 'open',
    firstDetectedAt: iso(alert.detectedAt),
    lastDetectedAt: iso(alert.detectedAt),
    occurrenceCount: 1,
    automaticRemediationEnabled: false,
    readOnly: true,
    executable: false,
  })
}

export class ClusterAlertLifecycleController {
  private readonly store: ClusterAlertLifecycleStore
  constructor(store: ClusterAlertLifecycleStore) { this.store = store }

  async ingest(evaluation: ClusterDeliveryAlertEvaluation): Promise<readonly ClusterAlertLifecycleRecord[]> {
    if (!evaluation || evaluation.schemaVersion !== 'agent-gateway-cluster-delivery-alert-evaluation-v1') throw new Error('invalid cluster alert evaluation')
    const records: ClusterAlertLifecycleRecord[] = []
    for (const alert of evaluation.alerts) {
      const current = await this.store.get(alert.alertId)
      if (!current) {
        const next = openRecord(alert)
        if (!(await this.store.compareAndSet(alert.alertId, 0, next))) throw new Error('cluster alert lifecycle changed concurrently')
        records.push(next)
        continue
      }
      if (current.clusterId !== alert.clusterId || current.instructionId !== alert.instructionId || current.kind !== alert.kind) throw new Error('cluster alert lifecycle identity conflict')
      const next: ClusterAlertLifecycleRecord = Object.freeze({
        ...current,
        severity: alert.severity,
        state: current.state === 'resolved' ? 'open' : current.state,
        lastDetectedAt: iso(alert.detectedAt),
        occurrenceCount: current.occurrenceCount + 1,
        ...(current.state === 'resolved' ? { acknowledgedAt: undefined, acknowledgedBy: undefined, resolvedAt: undefined, resolutionReason: undefined } : {}),
      })
      if (!(await this.store.compareAndSet(alert.alertId, current.occurrenceCount, next))) throw new Error('cluster alert recurrence changed concurrently')
      records.push(next)
    }
    return Object.freeze(records.sort((a, b) => a.alertId.localeCompare(b.alertId)))
  }

  async acknowledge(alertIdInput: string, actorInput: string, at = new Date()): Promise<ClusterAlertLifecycleRecord> {
    const alertId = required(alertIdInput, 'alertId')
    const actor = required(actorInput, 'actor')
    const current = await this.store.get(alertId)
    if (!current) throw new Error('cluster alert lifecycle record not found')
    if (current.state === 'resolved' || current.state === 'acknowledged') return current
    const next = Object.freeze({ ...current, state: 'acknowledged' as const, acknowledgedAt: iso(at), acknowledgedBy: actor })
    if (!(await this.store.compareAndSet(alertId, current.occurrenceCount, next))) throw new Error('cluster alert acknowledgment changed concurrently')
    return next
  }

  async resolve(alertIdInput: string, reasonInput: string, at = new Date()): Promise<ClusterAlertLifecycleRecord> {
    const alertId = required(alertIdInput, 'alertId')
    const reason = String(reasonInput || '').trim()
    if (!reason) throw new Error('invalid cluster alert resolution reason')
    const current = await this.store.get(alertId)
    if (!current) throw new Error('cluster alert lifecycle record not found')
    if (current.state === 'resolved') return current
    const next = Object.freeze({ ...current, state: 'resolved' as const, resolvedAt: iso(at), resolutionReason: reason.slice(0, 500) })
    if (!(await this.store.compareAndSet(alertId, current.occurrenceCount, next))) throw new Error('cluster alert resolution changed concurrently')
    return next
  }

  async cleanup(clusterIdInput: string, activeAlertIds: readonly string[], at = new Date()): Promise<ClusterAlertCleanupResult> {
    const clusterId = required(clusterIdInput, 'clusterId')
    const active = new Set(activeAlertIds.map(id => required(id, 'activeAlertId')))
    const resolved: string[] = []
    const retained: string[] = []
    for (const record of await this.store.listByCluster(clusterId)) {
      if (active.has(record.alertId) || record.state === 'resolved') { retained.push(record.alertId); continue }
      await this.resolve(record.alertId, 'alert no longer present in current evaluation', at)
      resolved.push(record.alertId)
    }
    return Object.freeze({ schemaVersion: 'agent-gateway-cluster-alert-cleanup-v1', clusterId, resolvedAlertIds: Object.freeze(resolved.sort()), retainedAlertIds: Object.freeze(retained.sort()), automaticRemediationEnabled: false, readOnly: true, executable: false })
  }
}

export class InMemoryClusterAlertLifecycleStore implements ClusterAlertLifecycleStore {
  private readonly records = new Map<string, ClusterAlertLifecycleRecord>()
  async get(alertId: string): Promise<ClusterAlertLifecycleRecord | null> { return this.records.get(alertId) ?? null }
  async listByCluster(clusterId: string): Promise<readonly ClusterAlertLifecycleRecord[]> { return Object.freeze([...this.records.values()].filter(item => item.clusterId === clusterId).sort((a, b) => a.alertId.localeCompare(b.alertId))) }
  async compareAndSet(alertId: string, expectedOccurrenceCount: number, next: ClusterAlertLifecycleRecord): Promise<boolean> {
    const current = this.records.get(alertId)
    if ((current?.occurrenceCount ?? 0) !== expectedOccurrenceCount) return false
    this.records.set(alertId, next)
    return true
  }
}
