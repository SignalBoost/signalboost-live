import test from 'node:test'
import assert from 'node:assert/strict'
import {
  InMemoryClusterElectionStore,
  commitClusterLeadershipPlan,
  createElectionState,
  type ClusterCoordinationPlan,
} from '../agent-gateway/index.ts'

function plan(overrides: Partial<ClusterCoordinationPlan> = {}): ClusterCoordinationPlan {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-plan-v1',
    clusterId: 'gateway-prod',
    term: 3,
    disposition: 'promote-candidate',
    selectedLeaderId: 'gw-b',
    promoteReplicaId: 'gw-b',
    demoteReplicaIds: Object.freeze(['gw-a']),
    quorumSize: 2,
    healthyVotingMemberCount: 3,
    reason: 'healthy quorum selected candidate',
    requiresNewTerm: true,
    splitBrainPrevented: true,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('creates immutable non-executable election state', () => {
  const state = createElectionState('gateway-prod', new Date('2026-07-25T20:00:00Z'))
  assert.equal(state.term, 0)
  assert.equal(state.readOnly, true)
  assert.equal(state.executable, false)
  assert.ok(Object.isFrozen(state))
})

test('quorum promotion commits one new durable term', async () => {
  const store = new InMemoryClusterElectionStore()
  const result = await commitClusterLeadershipPlan(store, plan(), new Date('2026-07-25T20:00:01Z'))
  assert.equal(result.disposition, 'committed')
  assert.equal(result.state.term, 4)
  assert.equal(result.state.leaderId, 'gw-b')
  assert.equal(result.state.votedFor, 'gw-b')
})

test('same stale plan cannot overwrite a newer durable term', async () => {
  const store = new InMemoryClusterElectionStore()
  await commitClusterLeadershipPlan(store, plan(), new Date('2026-07-25T20:00:01Z'))
  const stale = await commitClusterLeadershipPlan(store, plan({ term: 2, selectedLeaderId: 'gw-c', promoteReplicaId: 'gw-c' }), new Date('2026-07-25T20:00:02Z'))
  assert.equal(stale.disposition, 'rejected-stale-plan')
  assert.equal(stale.state.leaderId, 'gw-b')
  assert.equal(stale.state.term, 4)
})

test('wait-for-quorum never mutates election ownership', async () => {
  const store = new InMemoryClusterElectionStore()
  const result = await commitClusterLeadershipPlan(store, plan({ disposition: 'wait-for-quorum', selectedLeaderId: undefined, promoteReplicaId: undefined, requiresNewTerm: false }), new Date('2026-07-25T20:00:01Z'))
  assert.equal(result.disposition, 'rejected-no-promotion')
  assert.equal(result.state.term, 0)
  assert.equal(result.state.leaderId, null)
})

test('healthy retained leader is durably recorded without advancing term', async () => {
  const store = new InMemoryClusterElectionStore()
  const result = await commitClusterLeadershipPlan(store, plan({ disposition: 'retain-leader', requiresNewTerm: false, promoteReplicaId: undefined, demoteReplicaIds: Object.freeze([]) }), new Date('2026-07-25T20:00:01Z'))
  assert.equal(result.disposition, 'retained')
  assert.equal(result.state.term, 3)
  assert.equal(result.state.leaderId, 'gw-b')
})

test('compare-and-set rejects concurrent election ownership', async () => {
  const store = new InMemoryClusterElectionStore()
  const initial = createElectionState('gateway-prod', new Date('2026-07-25T20:00:00Z'))
  assert.equal(await store.compareAndSet('gateway-prod', 0, { ...initial, term: 5, leaderId: 'gw-a', votedFor: 'gw-a' }), true)
  assert.equal(await store.compareAndSet('gateway-prod', 0, { ...initial, term: 4, leaderId: 'gw-b', votedFor: 'gw-b' }), false)
  assert.equal((await store.get('gateway-prod'))?.leaderId, 'gw-a')
})

test('malformed promotion plans fail closed', async () => {
  const store = new InMemoryClusterElectionStore()
  await assert.rejects(() => commitClusterLeadershipPlan(store, plan({ promoteReplicaId: 'gw-c' })), /invalid election promotion plan/)
  assert.throws(() => createElectionState(' '), /invalid election clusterId/)
})
