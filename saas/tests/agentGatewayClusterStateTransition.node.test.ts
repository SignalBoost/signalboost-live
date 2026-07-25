import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClusterStateTransitionController,
  InMemoryClusterElectionStore,
  type ClusterCoordinationPlan,
} from '../agent-gateway/index.ts'

function plan(overrides: Partial<ClusterCoordinationPlan> = {}): ClusterCoordinationPlan {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-plan-v1',
    clusterId: 'gateway-us',
    term: 4,
    disposition: 'promote-candidate',
    selectedLeaderId: 'replica-b',
    promoteReplicaId: 'replica-b',
    demoteReplicaIds: Object.freeze(['replica-a']),
    quorumSize: 2,
    healthyVotingMemberCount: 3,
    reason: 'test',
    requiresNewTerm: true,
    splitBrainPrevented: true,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('commits a promotion with a higher term and durable leader', async () => {
  const store = new InMemoryClusterElectionStore()
  const controller = new ClusterStateTransitionController(store)
  const result = await controller.commit(plan(), new Date('2026-07-25T20:00:00Z'))
  assert.equal(result.term, 5)
  assert.equal(result.leaderId, 'replica-b')
  assert.equal(result.idempotent, false)
  assert.equal((await store.get('gateway-us'))?.leaderId, 'replica-b')
})

test('persists one vote per voter per term and rejects double voting', async () => {
  const controller = new ClusterStateTransitionController(new InMemoryClusterElectionStore())
  await controller.recordVote({ clusterId: 'gateway-us', voterId: 'replica-a', candidateId: 'replica-b', term: 2 })
  await assert.rejects(
    controller.recordVote({ clusterId: 'gateway-us', voterId: 'replica-a', candidateId: 'replica-c', term: 2 }),
    /double vote rejected/,
  )
})

test('rejects stale terms', async () => {
  const controller = new ClusterStateTransitionController(new InMemoryClusterElectionStore())
  await controller.recordVote({ clusterId: 'gateway-us', voterId: 'replica-a', candidateId: 'replica-b', term: 3 })
  await assert.rejects(controller.commit(plan({ term: 2 })), /stale cluster plan rejected/)
})

test('does not promote when quorum is unavailable', async () => {
  const store = new InMemoryClusterElectionStore()
  const controller = new ClusterStateTransitionController(store)
  const result = await controller.commit(plan({ disposition: 'wait-for-quorum', selectedLeaderId: undefined, promoteReplicaId: undefined, requiresNewTerm: false }))
  assert.equal(result.term, 0)
  assert.equal(result.leaderId, undefined)
  assert.equal(result.idempotent, true)
})

test('replays the same committed transition idempotently', async () => {
  const store = new InMemoryClusterElectionStore()
  const controller = new ClusterStateTransitionController(store)
  const first = await controller.commit(plan(), new Date('2026-07-25T20:00:00Z'))
  const second = await controller.commit(plan({ term: first.term, requiresNewTerm: false }), new Date('2026-07-25T20:01:00Z'))
  assert.equal(second.term, first.term)
  assert.equal(second.leaderId, first.leaderId)
  assert.equal(second.idempotent, true)
})
