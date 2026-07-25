import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createClusterMember,
  createClusterSnapshot,
  planClusterLeadership,
  rankLeadershipCandidates,
  type ReplicaHealthAssessment,
} from '../agent-gateway/index.ts'

function health(replicaId: string, state: ReplicaHealthAssessment['state']): ReplicaHealthAssessment {
  return Object.freeze({
    schemaVersion: 'agent-gateway-replica-health-v1',
    replicaId,
    state,
    heartbeatAgeMs: state === 'healthy' ? 100 : 60_000,
    reason: state,
    readOnly: true,
    executable: false,
  })
}

function member(replicaId: string, overrides: Record<string, unknown> = {}) {
  return createClusterMember({
    clusterId: 'gateway-prod',
    replicaId,
    role: 'gateway',
    region: 'us-east',
    version: '1.0.0',
    memberState: 'active',
    leadershipRole: 'follower',
    term: 4,
    priority: 100,
    queueDepth: 0,
    activeLeaseCount: 0,
    health: health(replicaId, 'healthy'),
    ...overrides,
  }, new Date('2026-07-25T20:00:00.000Z'))
}

test('retains one healthy leader when quorum exists', () => {
  const snapshot = createClusterSnapshot([
    member('gateway-a', { leadershipRole: 'leader' }),
    member('gateway-b'),
    member('gateway-c'),
  ])
  const plan = planClusterLeadership(snapshot)
  assert.equal(snapshot.hasQuorum, true)
  assert.equal(plan.disposition, 'retain-leader')
  assert.equal(plan.selectedLeaderId, 'gateway-a')
  assert.equal(plan.requiresNewTerm, false)
})

test('deterministically promotes the highest-ranked eligible replica', () => {
  const snapshot = createClusterSnapshot([
    member('gateway-a', { health: health('gateway-a', 'abandoned'), leadershipRole: 'leader' }),
    member('gateway-b', { priority: 200, queueDepth: 5 }),
    member('gateway-c', { priority: 200, queueDepth: 1 }),
  ])
  assert.deepEqual(rankLeadershipCandidates(snapshot).map((m) => m.replicaId), ['gateway-c', 'gateway-b'])
  const plan = planClusterLeadership(snapshot)
  assert.equal(plan.disposition, 'promote-candidate')
  assert.equal(plan.promoteReplicaId, 'gateway-c')
  assert.equal(plan.requiresNewTerm, true)
})

test('prevents promotion without healthy quorum', () => {
  const snapshot = createClusterSnapshot([
    member('gateway-a', { health: health('gateway-a', 'abandoned'), leadershipRole: 'leader' }),
    member('gateway-b', { health: health('gateway-b', 'unhealthy') }),
    member('gateway-c'),
  ])
  const plan = planClusterLeadership(snapshot)
  assert.equal(snapshot.hasQuorum, false)
  assert.equal(plan.disposition, 'wait-for-quorum')
  assert.equal(plan.promoteReplicaId, undefined)
  assert.equal(plan.splitBrainPrevented, true)
})

test('detects split brain and selects one leader only with quorum', () => {
  const snapshot = createClusterSnapshot([
    member('gateway-a', { leadershipRole: 'leader', priority: 100 }),
    member('gateway-b', { leadershipRole: 'leader', priority: 200 }),
    member('gateway-c'),
  ])
  const plan = planClusterLeadership(snapshot)
  assert.equal(snapshot.splitBrainDetected, true)
  assert.equal(plan.disposition, 'demote-conflicting-leaders')
  assert.equal(plan.selectedLeaderId, 'gateway-b')
  assert.deepEqual(plan.demoteReplicaIds, ['gateway-a'])
  assert.equal(plan.splitBrainPrevented, true)
})

test('fails closed on duplicate members and health identity mismatch', () => {
  const a = member('gateway-a')
  assert.throws(() => createClusterSnapshot([a, a]), /duplicate cluster replica/)
  assert.throws(() => member('gateway-b', { health: health('gateway-x', 'healthy') }), /health mismatch/)
})
