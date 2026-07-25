// saas/agent-gateway/cluster-state-transition.ts
//
// Atomic, host-neutral election state transitions. This module persists terms, votes,
// and leadership commits but never starts, stops, promotes, or demotes infrastructure.

import type { ClusterCoordinationPlan } from './cluster-coordinator.ts'

export interface ClusterElectionState {
  schemaVersion: 'agent-gateway-cluster-election-state-v1'
  clusterId: string
  term: number
  leaderId?: string
  votes: Readonly<Record<string, string>>
  committedAt?: string
  readOnly: true
  executable: false
}

export interface ClusterTransitionCommit {
  schemaVersion: 'agent-gateway-cluster-transition-commit-v1'
  clusterId: string
  previousTerm: number
  term: number
  leaderId?: string
  promotedReplicaId?: string
  demotedReplicaIds: readonly string[]
  disposition: ClusterCoordinationPlan['disposition']
  committedAt: string
  idempotent: boolean
  readOnly: true
  executable: false
}

export interface ClusterElectionStore {
  get(clusterId: string): Promise<ClusterElectionState | null>
  compareAndSet(clusterId: string, expectedTerm: number, next: ClusterElectionState): Promise<boolean>
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
function required(value: string, field: string): string {
  const v = value.trim()
  if (!ID.test(v)) throw new Error(`invalid election ${field}`)
  return v
}
function validDate(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid election clock')
  return now.toISOString()
}
function emptyElectionState(clusterId: string): ClusterElectionState {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-election-state-v1',
    clusterId,
    term: 0,
    votes: Object.freeze({}),
    readOnly: true,
    executable: false,
  })
}

export class ClusterStateTransitionController {
  // Explicit field, not a constructor parameter property. The suites run `node --test`
  // on .ts sources, which STRIPS types instead of compiling them, and strip-only mode
  // cannot emit the implicit assignment. A parameter property compiles fine in the Next
  // build and kills every suite importing the agent-gateway barrel. Guarded in prebuild
  // by scripts/validate-strip-safe.mjs.
  private readonly store: ClusterElectionStore

  constructor(store: ClusterElectionStore) {
    this.store = store
  }

  async recordVote(input: { clusterId: string; voterId: string; candidateId: string; term: number }): Promise<ClusterElectionState> {
    const clusterId = required(input.clusterId, 'clusterId')
    const voterId = required(input.voterId, 'voterId')
    const candidateId = required(input.candidateId, 'candidateId')
    if (!Number.isSafeInteger(input.term) || input.term < 0) throw new Error('invalid election term')
    const current: ClusterElectionState = (await this.store.get(clusterId)) ?? emptyElectionState(clusterId)
    if (input.term < current.term) throw new Error('stale election term rejected')
    if (input.term === current.term && current.votes[voterId] && current.votes[voterId] !== candidateId) throw new Error('double vote rejected')
    if (input.term === current.term && current.votes[voterId] === candidateId) return current
    const next: ClusterElectionState = Object.freeze({ schemaVersion: 'agent-gateway-cluster-election-state-v1', clusterId, term: input.term, votes: Object.freeze({ ...(input.term === current.term ? current.votes : {}), [voterId]: candidateId }), readOnly: true, executable: false })
    if (!(await this.store.compareAndSet(clusterId, current.term, next))) throw new Error('election state changed concurrently')
    return next
  }

  async commit(plan: ClusterCoordinationPlan, now = new Date()): Promise<ClusterTransitionCommit> {
    const clusterId = required(plan.clusterId, 'clusterId')
    const current: ClusterElectionState = (await this.store.get(clusterId)) ?? emptyElectionState(clusterId)
    if (plan.term < current.term) throw new Error('stale cluster plan rejected')
    if (plan.disposition === 'wait-for-quorum' || plan.disposition === 'no-eligible-candidate') {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-transition-commit-v1', clusterId, previousTerm: current.term, term: current.term, ...(current.leaderId ? { leaderId: current.leaderId } : {}), demotedReplicaIds: Object.freeze([...plan.demoteReplicaIds]), disposition: plan.disposition, committedAt: validDate(now), idempotent: true, readOnly: true, executable: false })
    }
    const leaderId = plan.selectedLeaderId ? required(plan.selectedLeaderId, 'leaderId') : current.leaderId
    const nextTerm = plan.requiresNewTerm ? Math.max(current.term, plan.term) + 1 : Math.max(current.term, plan.term)
    if (current.term === nextTerm && current.leaderId === leaderId) {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-transition-commit-v1', clusterId, previousTerm: current.term, term: current.term, ...(leaderId ? { leaderId } : {}), ...(plan.promoteReplicaId ? { promotedReplicaId: plan.promoteReplicaId } : {}), demotedReplicaIds: Object.freeze([...plan.demoteReplicaIds]), disposition: plan.disposition, committedAt: current.committedAt ?? validDate(now), idempotent: true, readOnly: true, executable: false })
    }
    const committedAt = validDate(now)
    const next: ClusterElectionState = Object.freeze({ schemaVersion: 'agent-gateway-cluster-election-state-v1', clusterId, term: nextTerm, ...(leaderId ? { leaderId } : {}), votes: Object.freeze({}), committedAt, readOnly: true, executable: false })
    if (!(await this.store.compareAndSet(clusterId, current.term, next))) throw new Error('cluster transition changed concurrently')
    return Object.freeze({ schemaVersion: 'agent-gateway-cluster-transition-commit-v1', clusterId, previousTerm: current.term, term: nextTerm, ...(leaderId ? { leaderId } : {}), ...(plan.promoteReplicaId ? { promotedReplicaId: plan.promoteReplicaId } : {}), demotedReplicaIds: Object.freeze([...plan.demoteReplicaIds]), disposition: plan.disposition, committedAt, idempotent: false, readOnly: true, executable: false })
  }
}

export class InMemoryClusterElectionStore implements ClusterElectionStore {
  private readonly states = new Map<string, ClusterElectionState>()
  async get(clusterId: string): Promise<ClusterElectionState | null> { return this.states.get(clusterId) ?? null }
  async compareAndSet(clusterId: string, expectedTerm: number, next: ClusterElectionState): Promise<boolean> {
    const current = this.states.get(clusterId)
    if ((current?.term ?? 0) !== expectedTerm) return false
    this.states.set(clusterId, next)
    return true
  }
}
