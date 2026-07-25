import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClusterRuntimeAdapterContract,
  InMemoryClusterRuntimeInstructionStore,
  translateClusterTransition,
} from '../agent-gateway/cluster-runtime-adapter.ts'
import type { ClusterTransitionCommit } from '../agent-gateway/cluster-state-transition.ts'

function commit(overrides: Partial<ClusterTransitionCommit> = {}): ClusterTransitionCommit {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-transition-commit-v1',
    clusterId: 'gateway-us-east',
    previousTerm: 4,
    term: 5,
    leaderId: 'gateway-b',
    promotedReplicaId: 'gateway-b',
    demotedReplicaIds: Object.freeze(['gateway-a']),
    disposition: 'promote-candidate',
    committedAt: '2026-07-25T21:00:00.000Z',
    idempotent: false,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('translates committed leadership changes into deterministic instructions', () => {
  const instructions = translateClusterTransition(commit())
  assert.deepEqual(instructions.map((item) => item.action), ['promote', 'demote'])
  assert.equal(instructions[0].replicaId, 'gateway-b')
  assert.equal(instructions[1].replicaId, 'gateway-a')
  assert.equal(instructions[0].infrastructureMutationEnabled, false)
  assert.equal(instructions[0].executable, false)
})

test('stages instructions idempotently', async () => {
  const adapter = new ClusterRuntimeAdapterContract(new InMemoryClusterRuntimeInstructionStore())
  const first = await adapter.stage(commit())
  const second = await adapter.stage(commit())
  assert.equal(first.length, 2)
  assert.equal(second.length, 2)
  assert.strictEqual(first[0], second[0])
})

test('emits a noop when no runtime change is required', () => {
  const instructions = translateClusterTransition(commit({
    promotedReplicaId: undefined,
    demotedReplicaIds: Object.freeze([]),
    disposition: 'retain-leader',
    idempotent: true,
  }))
  assert.equal(instructions.length, 1)
  assert.equal(instructions[0].action, 'noop')
})

test('sorts demotion instructions deterministically', () => {
  const instructions = translateClusterTransition(commit({
    promotedReplicaId: undefined,
    demotedReplicaIds: Object.freeze(['gateway-z', 'gateway-a']),
    disposition: 'demote-conflicting-leaders',
  }))
  assert.deepEqual(instructions.map((item) => item.replicaId), ['gateway-a', 'gateway-z'])
})

test('rejects malformed commits', () => {
  assert.throws(() => translateClusterTransition({} as ClusterTransitionCommit), /invalid cluster transition commit/)
})
