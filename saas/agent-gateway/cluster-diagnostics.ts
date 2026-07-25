// saas/agent-gateway/cluster-diagnostics.ts
//
// Read-only operator diagnostics for cluster coordination and durable election state.

import type { ClusterCoordinationPlan, ClusterSnapshot } from './cluster-coordinator.ts'
import type { ClusterElectionState, ClusterTransitionCommit } from './cluster-state-transition.ts'

export type ClusterDiagnosticStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export interface ClusterDiagnosticsSnapshot {
  schemaVersion: 'agent-gateway-cluster-diagnostics-v1'
  generatedAt: string
  clusterId: string
  role: ClusterSnapshot['role']
  status: ClusterDiagnosticStatus
  term: number
  durableTerm: number
  currentLeaderId: string | null
  durableLeaderId: string | null
  memberCount: number
  votingMemberCount: number
  healthyVotingMemberCount: number
  quorumSize: number
  hasQuorum: boolean
  splitBrainDetected: boolean
  plannedDisposition: ClusterCoordinationPlan['disposition']
  promotionPending: boolean
  demotionCount: number
  voteCount: number
  lastCommit: Readonly<{
    disposition: ClusterTransitionCommit['disposition']
    term: number
    committedAt: string
    idempotent: boolean
  }> | null
  safety: Readonly<{
    readOnly: true
    infrastructureMutationEnabled: false
    automaticPromotionEnabled: false
    automaticDemotionEnabled: false
  }>
  executable: false
}

function timestamp(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster diagnostics timestamp')
  return new Date(parsed).toISOString()
}

function status(snapshot: ClusterSnapshot, election: ClusterElectionState | null): ClusterDiagnosticStatus {
  if (snapshot.splitBrainDetected) return 'critical'
  if (!snapshot.hasQuorum) return 'critical'
  if (!snapshot.currentLeaderId || !election?.leaderId) return 'degraded'
  if (snapshot.currentLeaderId !== election.leaderId || snapshot.term !== election.term) return 'degraded'
  return 'healthy'
}

export function createClusterDiagnostics(input: {
  generatedAt: string
  snapshot: ClusterSnapshot
  plan: ClusterCoordinationPlan
  electionState: ClusterElectionState | null
  lastCommit?: ClusterTransitionCommit | null
}): ClusterDiagnosticsSnapshot {
  if (input.snapshot.clusterId !== input.plan.clusterId) throw new Error('cluster diagnostics plan mismatch')
  if (input.electionState && input.electionState.clusterId !== input.snapshot.clusterId) throw new Error('cluster diagnostics election mismatch')
  if (input.lastCommit && input.lastCommit.clusterId !== input.snapshot.clusterId) throw new Error('cluster diagnostics commit mismatch')
  const generatedAt = timestamp(input.generatedAt)
  const election = input.electionState
  const commit = input.lastCommit ?? null

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-diagnostics-v1',
    generatedAt,
    clusterId: input.snapshot.clusterId,
    role: input.snapshot.role,
    status: status(input.snapshot, election),
    term: input.snapshot.term,
    durableTerm: election?.term ?? 0,
    currentLeaderId: input.snapshot.currentLeaderId ?? null,
    durableLeaderId: election?.leaderId ?? null,
    memberCount: input.snapshot.members.length,
    votingMemberCount: input.snapshot.votingMemberCount,
    healthyVotingMemberCount: input.snapshot.healthyVotingMemberCount,
    quorumSize: input.snapshot.quorumSize,
    hasQuorum: input.snapshot.hasQuorum,
    splitBrainDetected: input.snapshot.splitBrainDetected,
    plannedDisposition: input.plan.disposition,
    promotionPending: Boolean(input.plan.promoteReplicaId && input.plan.requiresNewTerm),
    demotionCount: input.plan.demoteReplicaIds.length,
    voteCount: election ? Object.keys(election.votes).length : 0,
    lastCommit: commit ? Object.freeze({ disposition: commit.disposition, term: commit.term, committedAt: commit.committedAt, idempotent: commit.idempotent }) : null,
    safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, automaticPromotionEnabled: false, automaticDemotionEnabled: false }),
    executable: false,
  })
}
