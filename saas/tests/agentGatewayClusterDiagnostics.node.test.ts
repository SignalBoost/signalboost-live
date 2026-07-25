import test from 'node:test'
import assert from 'node:assert/strict'
import { createClusterDiagnostics, type ClusterCoordinationPlan, type ClusterElectionState, type ClusterSnapshot } from '../agent-gateway/index.ts'

const snapshot: ClusterSnapshot = Object.freeze({ schemaVersion: 'agent-gateway-cluster-snapshot-v1', clusterId: 'gateway-prod', role: 'gateway', term: 4, members: Object.freeze([]), quorumSize: 2, votingMemberCount: 3, healthyVotingMemberCount: 3, currentLeaderId: 'gw-b', hasQuorum: true, splitBrainDetected: false, readOnly: true, executable: false })
const plan: ClusterCoordinationPlan = Object.freeze({ schemaVersion: 'agent-gateway-cluster-plan-v1', clusterId: 'gateway-prod', term: 4, disposition: 'retain-leader', selectedLeaderId: 'gw-b', demoteReplicaIds: Object.freeze([]), quorumSize: 2, healthyVotingMemberCount: 3, reason: 'healthy leader', requiresNewTerm: false, splitBrainPrevented: false, readOnly: true, executable: false })
const election: ClusterElectionState = Object.freeze({ schemaVersion: 'agent-gateway-cluster-election-state-v1', clusterId: 'gateway-prod', term: 4, leaderId: 'gw-b', votes: Object.freeze({ 'gw-a': 'gw-b', 'gw-b': 'gw-b' }), committedAt: '2026-07-25T20:00:00.000Z', readOnly: true, executable: false })

test('healthy diagnostics align observed and durable leadership', () => {
  const result = createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot, plan, electionState: election })
  assert.equal(result.status, 'healthy')
  assert.equal(result.voteCount, 2)
  assert.equal(result.safety.readOnly, true)
  assert.equal(result.safety.infrastructureMutationEnabled, false)
  assert.equal(result.executable, false)
})

test('term or leader drift is degraded', () => {
  const result = createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot, plan, electionState: { ...election, term: 3, leaderId: 'gw-a' } })
  assert.equal(result.status, 'degraded')
})

test('split brain and quorum loss are critical', () => {
  assert.equal(createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot: { ...snapshot, splitBrainDetected: true }, plan, electionState: election }).status, 'critical')
  assert.equal(createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot: { ...snapshot, hasQuorum: false }, plan, electionState: election }).status, 'critical')
})

test('promotion plan is visible but never executable', () => {
  const result = createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot, plan: { ...plan, disposition: 'promote-candidate', promoteReplicaId: 'gw-b', requiresNewTerm: true }, electionState: election })
  assert.equal(result.promotionPending, true)
  assert.equal(result.safety.automaticPromotionEnabled, false)
})

test('identity mismatches and invalid clocks fail closed', () => {
  assert.throws(() => createClusterDiagnostics({ generatedAt: 'bad', snapshot, plan, electionState: election }), /timestamp/)
  assert.throws(() => createClusterDiagnostics({ generatedAt: '2026-07-25T20:00:01Z', snapshot, plan: { ...plan, clusterId: 'other' }, electionState: election }), /plan mismatch/)
})
