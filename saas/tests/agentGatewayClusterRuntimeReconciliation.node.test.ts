import assert from 'node:assert/strict'
import test from 'node:test'

import { reconcileClusterRuntimeInstructions } from '../agent-gateway/cluster-runtime-reconciliation.ts'
import type { ClusterRuntimeInstruction } from '../agent-gateway/cluster-runtime-adapter.ts'
import type { ClusterRuntimeReceipt } from '../agent-gateway/cluster-runtime-receipts.ts'

function instruction(id = 'cluster-a:2:promote:replica-b'): ClusterRuntimeInstruction {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1',
    instructionId: id,
    clusterId: 'cluster-a',
    term: 2,
    replicaId: 'replica-b',
    action: 'promote',
    reason: 'committed promotion',
    idempotencyKey: id,
    requiresGovernedRuntime: true,
    infrastructureMutationEnabled: false,
    readOnly: true,
    executable: false,
  })
}

function receipt(state: ClusterRuntimeReceipt['state'], overrides: Partial<ClusterRuntimeReceipt> = {}): ClusterRuntimeReceipt {
  const baseInstruction = instruction()
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-receipt-v1',
    receiptId: `${baseInstruction.instructionId}:runtime-a:${state}`,
    instructionId: baseInstruction.instructionId,
    idempotencyKey: baseInstruction.idempotencyKey,
    clusterId: baseInstruction.clusterId,
    term: baseInstruction.term,
    replicaId: baseInstruction.replicaId,
    action: baseInstruction.action,
    runtimeId: 'runtime-a',
    state,
    observedAt: '2026-07-25T21:00:00.000Z',
    infrastructureMutationEnabled: false,
    readOnly: true,
    executable: false,
    ...overrides,
  })
}

test('recommends retry when an instruction has no receipt', () => {
  const snapshot = reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [], generatedAt: '2026-07-25T21:01:00.000Z' })
  assert.equal(snapshot.instructions[0].state, 'retry-recommended')
  assert.equal(snapshot.instructions[0].retryRecommended, true)
  assert.deepEqual(snapshot.instructions[0].issues, ['missing_receipt'])
  assert.equal(snapshot.automaticRetryEnabled, false)
})

test('marks verified receipts complete and reconciliation is deterministic', () => {
  const input = { instructions: [instruction()], receipts: [receipt('verified')], generatedAt: '2026-07-25T21:01:00.000Z' }
  assert.deepEqual(reconcileClusterRuntimeInstructions(input), reconcileClusterRuntimeInstructions(input))
  assert.equal(reconcileClusterRuntimeInstructions(input).summary.verified, 1)
})

test('reports duplicate receipts without executing a retry', () => {
  const duplicate = receipt('acknowledged')
  const snapshot = reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [duplicate, duplicate], generatedAt: '2026-07-25T21:01:00.000Z' })
  assert.equal(snapshot.summary.duplicateReceipts, 1)
  assert.deepEqual(snapshot.instructions[0].issues, ['duplicate_receipts'])
})

test('recommends retry for expired receipts', () => {
  const snapshot = reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [receipt('expired')], generatedAt: '2026-07-25T21:01:00.000Z' })
  assert.equal(snapshot.instructions[0].state, 'retry-recommended')
  assert.equal(snapshot.instructions[0].retryReason, 'runtime receipt expired')
})

test('blocks conflicting terminal receipt states', () => {
  const snapshot = reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [receipt('verified'), receipt('rejected')], generatedAt: '2026-07-25T21:01:00.000Z' })
  assert.equal(snapshot.instructions[0].state, 'blocked')
  assert.deepEqual(snapshot.instructions[0].issues, ['conflicting_terminal_states'])
})

test('fails closed on orphan or unsafe receipts', () => {
  assert.throws(() => reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [receipt('verified', { instructionId: 'other' })], generatedAt: '2026-07-25T21:01:00.000Z' }), /orphan/)
  assert.throws(() => reconcileClusterRuntimeInstructions({ instructions: [instruction()], receipts: [receipt('verified', { executable: true as false })], generatedAt: '2026-07-25T21:01:00.000Z' }), /unsafe/)
})
