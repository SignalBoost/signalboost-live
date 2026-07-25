// saas/agent-gateway/election-state.ts
//
// Durable, host-neutral election term and vote coordination. This module never promotes
// infrastructure; it atomically records terms and votes so stale cluster plans fail closed.

import type { ClusterCoordinationPlan } from './cluster-coordinator.ts'

export interface ClusterElectionState {
  schemaVersion: 'agent-gateway-election-state-v1'
  clusterId: string
  term: number
  votedFor: string | null
  leaderId: string | null
  updatedAt: string
  readOnly: true
  executable: false
}

export interface ClusterElectionStore {
  get(clusterId: string): Promise<ClusterElectionState | null>
  compareAndSet(clusterId: string, expectedTerm: number, next: ClusterElectionState): Promise<boolean>
}

export type ElectionCommitDisposition = 'committed' | 'retained' | 'rejected-stale-plan' | 'rejected-no-promotion'

export interface ElectionCommitResult {
  schemaVersion: 'agent-gateway-election-commit-v1'
  disposition: ElectionCommitDisposition
  state: ClusterElectionState
  reason: string
  readOnly: true
  executable: false
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: string, field: string): string {
  const normalized = String(value || '').trim()
  if (!ID.test(normalized)) throw new Error(`invalid election ${field}`)
  return normalized
}

function validNow(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid election clock')
  return now.toISOString()
}

export function createElectionState(clusterId: string, now = new Date()): ClusterElectionState {
  return Object.freeze({
    schemaVersion: 'agent-gateway-election-state-v1',
    clusterId: required(clusterId, 'clusterId'),
    term: 0,
    votedFor: null,
    leaderId: null,
    updatedAt: validNow(now),
    readOnly: true,
    executable: false,
  })
}

export async function commitClusterLeadershipPlan(
  store: ClusterElectionStore,
  plan: ClusterCoordinationPlan,
  now = new Date(),
): Promise<ElectionCommitResult> {
  const clusterId = required(plan.clusterId, 'clusterId')
  const current = await store.get(clusterId) ?? createElectionState(clusterId, now)

  if (plan.term < current.term) {
    return Object.freeze({ schemaVersion: 'agent-gateway-election-commit-v1', disposition: 'rejected-stale-plan', state: current, reason: 'cluster plan term is older than durable election state', readOnly: true, executable: false })
  }

  if (plan.disposition === 'retain-leader') {
    if (!plan.selectedLeaderId) throw new Error('election retained leader required')
    if (current.term > plan.term || (current.leaderId && current.leaderId !== plan.selectedLeaderId)) {
      return Object.freeze({ schemaVersion: 'agent-gateway-election-commit-v1', disposition: 'rejected-stale-plan', state: current, reason: 'durable leader differs from retained plan', readOnly: true, executable: false })
    }
    const retained = Object.freeze({ ...current, term: plan.term, votedFor: plan.selectedLeaderId, leaderId: plan.selectedLeaderId, updatedAt: validNow(now) })
    const saved = await store.compareAndSet(clusterId, current.term, retained)
    const state = saved ? retained : (await store.get(clusterId) ?? current)
    return Object.freeze({ schemaVersion: 'agent-gateway-election-commit-v1', disposition: saved ? 'retained' : 'rejected-stale-plan', state, reason: saved ? 'healthy leader retained in durable election state' : 'election state changed concurrently', readOnly: true, executable: false })
  }

  if (!['promote-candidate', 'demote-conflicting-leaders'].includes(plan.disposition)) {
    return Object.freeze({ schemaVersion: 'agent-gateway-election-commit-v1', disposition: 'rejected-no-promotion', state: current, reason: 'coordination plan does not authorize leadership promotion', readOnly: true, executable: false })
  }
  if (!plan.requiresNewTerm || !plan.promoteReplicaId || !plan.selectedLeaderId || plan.promoteReplicaId !== plan.selectedLeaderId) {
    throw new Error('invalid election promotion plan')
  }

  const nextTerm = Math.max(current.term, plan.term) + 1
  const next = Object.freeze({
    schemaVersion: 'agent-gateway-election-state-v1' as const,
    clusterId,
    term: nextTerm,
    votedFor: plan.promoteReplicaId,
    leaderId: plan.promoteReplicaId,
    updatedAt: validNow(now),
    readOnly: true as const,
    executable: false as const,
  })
  const saved = await store.compareAndSet(clusterId, current.term, next)
  const state = saved ? next : (await store.get(clusterId) ?? current)
  return Object.freeze({ schemaVersion: 'agent-gateway-election-commit-v1', disposition: saved ? 'committed' : 'rejected-stale-plan', state, reason: saved ? 'leadership plan committed with a new durable term' : 'election state changed concurrently', readOnly: true, executable: false })
}

export class InMemoryClusterElectionStore implements ClusterElectionStore {
  private readonly states = new Map<string, ClusterElectionState>()
  async get(clusterId: string): Promise<ClusterElectionState | null> { return this.states.get(clusterId) ?? null }
  async compareAndSet(clusterId: string, expectedTerm: number, next: ClusterElectionState): Promise<boolean> {
    const current = this.states.get(clusterId)
    if ((current?.term ?? 0) !== expectedTerm) return false
    if (next.clusterId !== clusterId || next.term < expectedTerm) throw new Error('invalid election transition')
    this.states.set(clusterId, next)
    return true
  }
}
