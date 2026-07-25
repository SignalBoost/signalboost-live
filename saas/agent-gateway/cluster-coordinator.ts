// saas/agent-gateway/cluster-coordinator.ts
//
// Deterministic, host-neutral cluster membership and leadership planning.
// This module never starts, stops, promotes, or demotes infrastructure. It emits
// immutable, non-executable plans that a separately governed runtime may consume.

import type { ReplicaHealthAssessment, ReplicaRole } from './replica-health.ts'

export type ClusterMemberState = 'joining' | 'active' | 'draining' | 'removed'
export type ClusterLeadershipRole = 'leader' | 'follower' | 'candidate' | 'ineligible'

export interface ClusterMemberInput {
  clusterId: string
  replicaId: string
  role: ReplicaRole
  region: string
  version: string
  memberState: ClusterMemberState
  leadershipRole: ClusterLeadershipRole
  term: number
  voteGrantedTo?: string
  priority: number
  queueDepth: number
  activeLeaseCount: number
  health: ReplicaHealthAssessment
}

export interface ClusterMember extends ClusterMemberInput {
  schemaVersion: 'agent-gateway-cluster-member-v1'
  observedAt: string
  readOnly: true
  executable: false
}

export interface ClusterSnapshot {
  schemaVersion: 'agent-gateway-cluster-snapshot-v1'
  clusterId: string
  role: ReplicaRole
  term: number
  members: readonly ClusterMember[]
  quorumSize: number
  votingMemberCount: number
  healthyVotingMemberCount: number
  currentLeaderId?: string
  hasQuorum: boolean
  splitBrainDetected: boolean
  readOnly: true
  executable: false
}

export type ClusterPlanDisposition =
  | 'retain-leader'
  | 'promote-candidate'
  | 'demote-conflicting-leaders'
  | 'wait-for-quorum'
  | 'no-eligible-candidate'

export interface ClusterCoordinationPlan {
  schemaVersion: 'agent-gateway-cluster-plan-v1'
  clusterId: string
  term: number
  disposition: ClusterPlanDisposition
  selectedLeaderId?: string
  promoteReplicaId?: string
  demoteReplicaIds: readonly string[]
  quorumSize: number
  healthyVotingMemberCount: number
  reason: string
  requiresNewTerm: boolean
  splitBrainPrevented: boolean
  readOnly: true
  executable: false
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!ID.test(normalized)) throw new Error(`invalid cluster ${field}`)
  return normalized
}

function integer(value: number, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`invalid cluster ${field}`)
  return value
}

function validDate(now: Date): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid cluster clock')
  return now
}

function isVoting(member: ClusterMember): boolean {
  return member.memberState === 'active' || member.memberState === 'draining'
}

function isHealthy(member: ClusterMember): boolean {
  return member.health.state === 'healthy' || member.health.state === 'degraded'
}

function isLeadershipEligible(member: ClusterMember): boolean {
  return member.memberState === 'active' && isHealthy(member) && member.leadershipRole !== 'ineligible'
}

export function createClusterMember(input: ClusterMemberInput, now = new Date()): ClusterMember {
  const clusterId = required(input.clusterId, 'clusterId')
  const replicaId = required(input.replicaId, 'replicaId')
  if (input.health.replicaId !== replicaId) throw new Error('cluster member health mismatch')
  if (input.voteGrantedTo) required(input.voteGrantedTo, 'voteGrantedTo')
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-member-v1',
    ...input,
    clusterId,
    replicaId,
    region: required(input.region, 'region'),
    version: required(input.version, 'version'),
    term: integer(input.term, 'term', 0),
    priority: integer(input.priority, 'priority', 0, 1_000_000),
    queueDepth: integer(input.queueDepth, 'queueDepth'),
    activeLeaseCount: integer(input.activeLeaseCount, 'activeLeaseCount'),
    observedAt: validDate(now).toISOString(),
    readOnly: true,
    executable: false,
  })
}

export function createClusterSnapshot(members: readonly ClusterMember[]): ClusterSnapshot {
  if (!Array.isArray(members) || members.length === 0) throw new Error('cluster requires members')
  const sorted = [...members].sort((a, b) => a.replicaId.localeCompare(b.replicaId))
  const clusterId = sorted[0].clusterId
  const role = sorted[0].role
  if (new Set(sorted.map((m) => m.replicaId)).size !== sorted.length) throw new Error('duplicate cluster replica')
  if (sorted.some((m) => m.clusterId !== clusterId)) throw new Error('cluster identity mismatch')
  if (sorted.some((m) => m.role !== role)) throw new Error('cluster role mismatch')

  const votingMembers = sorted.filter(isVoting)
  const quorumSize = Math.floor(votingMembers.length / 2) + 1
  const healthyVotingMemberCount = votingMembers.filter(isHealthy).length
  const leaders = sorted.filter((m) => m.leadershipRole === 'leader' && m.memberState !== 'removed')
  const highestTerm = Math.max(...sorted.map((m) => m.term))
  const highestTermLeaders = leaders.filter((m) => m.term === highestTerm)
  const splitBrainDetected = highestTermLeaders.length > 1 || new Set(leaders.map((m) => m.term)).size > 1
  const currentLeaderId = highestTermLeaders.length === 1 ? highestTermLeaders[0].replicaId : undefined

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-snapshot-v1',
    clusterId,
    role,
    term: highestTerm,
    members: Object.freeze(sorted),
    quorumSize,
    votingMemberCount: votingMembers.length,
    healthyVotingMemberCount,
    ...(currentLeaderId ? { currentLeaderId } : {}),
    hasQuorum: healthyVotingMemberCount >= quorumSize,
    splitBrainDetected,
    readOnly: true,
    executable: false,
  })
}

function compareCandidates(a: ClusterMember, b: ClusterMember): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.health.state !== b.health.state) return a.health.state === 'healthy' ? -1 : 1
  if (a.activeLeaseCount !== b.activeLeaseCount) return a.activeLeaseCount - b.activeLeaseCount
  if (a.queueDepth !== b.queueDepth) return a.queueDepth - b.queueDepth
  if (a.restartCount !== undefined || b.restartCount !== undefined) return 0
  return a.replicaId.localeCompare(b.replicaId)
}

export function rankLeadershipCandidates(snapshot: ClusterSnapshot): readonly ClusterMember[] {
  return Object.freeze(snapshot.members.filter(isLeadershipEligible).sort(compareCandidates))
}

export function planClusterLeadership(snapshot: ClusterSnapshot): ClusterCoordinationPlan {
  const leaders = snapshot.members.filter((m) => m.leadershipRole === 'leader' && m.memberState !== 'removed')
  const healthyCurrentLeader = snapshot.currentLeaderId
    ? snapshot.members.find((m) => m.replicaId === snapshot.currentLeaderId && isLeadershipEligible(m))
    : undefined

  if (snapshot.splitBrainDetected) {
    const candidates = rankLeadershipCandidates(snapshot)
    const selected = snapshot.hasQuorum ? candidates[0] : undefined
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-plan-v1',
      clusterId: snapshot.clusterId,
      term: snapshot.term,
      disposition: snapshot.hasQuorum && selected ? 'demote-conflicting-leaders' : 'wait-for-quorum',
      ...(selected ? { selectedLeaderId: selected.replicaId, promoteReplicaId: selected.replicaId } : {}),
      demoteReplicaIds: Object.freeze(leaders.filter((m) => m.replicaId !== selected?.replicaId).map((m) => m.replicaId).sort()),
      quorumSize: snapshot.quorumSize,
      healthyVotingMemberCount: snapshot.healthyVotingMemberCount,
      reason: snapshot.hasQuorum && selected ? 'split brain detected; quorum selects one deterministic leader and demotes conflicts' : 'split brain detected without healthy quorum; no promotion permitted',
      requiresNewTerm: Boolean(selected),
      splitBrainPrevented: true,
      readOnly: true,
      executable: false,
    })
  }

  if (healthyCurrentLeader && snapshot.hasQuorum) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-plan-v1',
      clusterId: snapshot.clusterId,
      term: snapshot.term,
      disposition: 'retain-leader',
      selectedLeaderId: healthyCurrentLeader.replicaId,
      demoteReplicaIds: Object.freeze([]),
      quorumSize: snapshot.quorumSize,
      healthyVotingMemberCount: snapshot.healthyVotingMemberCount,
      reason: 'current leader is healthy and retains quorum support',
      requiresNewTerm: false,
      splitBrainPrevented: false,
      readOnly: true,
      executable: false,
    })
  }

  if (!snapshot.hasQuorum) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-plan-v1',
      clusterId: snapshot.clusterId,
      term: snapshot.term,
      disposition: 'wait-for-quorum',
      demoteReplicaIds: Object.freeze(leaders.map((m) => m.replicaId).sort()),
      quorumSize: snapshot.quorumSize,
      healthyVotingMemberCount: snapshot.healthyVotingMemberCount,
      reason: 'healthy quorum unavailable; promotion is prohibited to prevent split brain',
      requiresNewTerm: false,
      splitBrainPrevented: true,
      readOnly: true,
      executable: false,
    })
  }

  const candidate = rankLeadershipCandidates(snapshot)[0]
  if (!candidate) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-plan-v1',
      clusterId: snapshot.clusterId,
      term: snapshot.term,
      disposition: 'no-eligible-candidate',
      demoteReplicaIds: Object.freeze(leaders.map((m) => m.replicaId).sort()),
      quorumSize: snapshot.quorumSize,
      healthyVotingMemberCount: snapshot.healthyVotingMemberCount,
      reason: 'quorum exists but no healthy active replica is eligible for leadership',
      requiresNewTerm: false,
      splitBrainPrevented: true,
      readOnly: true,
      executable: false,
    })
  }

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-plan-v1',
    clusterId: snapshot.clusterId,
    term: snapshot.term,
    disposition: 'promote-candidate',
    selectedLeaderId: candidate.replicaId,
    promoteReplicaId: candidate.replicaId,
    demoteReplicaIds: Object.freeze(leaders.filter((m) => m.replicaId !== candidate.replicaId).map((m) => m.replicaId).sort()),
    quorumSize: snapshot.quorumSize,
    healthyVotingMemberCount: snapshot.healthyVotingMemberCount,
    reason: 'healthy quorum deterministically selected the highest-ranked eligible candidate',
    requiresNewTerm: true,
    splitBrainPrevented: true,
    readOnly: true,
    executable: false,
  })
}
