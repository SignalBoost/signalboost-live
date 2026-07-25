import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterDeliveryDiagnostics } from '../agent-gateway/cluster-delivery-diagnostics.ts'
import type { ClusterInstructionDeliveryRecord } from '../agent-gateway/cluster-instruction-ack.ts'
import type { ClusterRuntimeInstruction } from '../agent-gateway/cluster-runtime-adapter.ts'

function instruction(id: string, term = 5): ClusterRuntimeInstruction {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1', instructionId: id, clusterId: 'cluster-a', term, replicaId: id, action: 'promote', reason: 'test', idempotencyKey: id, requiresGovernedRuntime: true, infrastructureMutationEnabled: false, readOnly: true, executable: false })
}

function delivery(id: string, overrides: Partial<ClusterInstructionDeliveryRecord> = {}): ClusterInstructionDeliveryRecord {
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-delivery-v1', instructionId: id, idempotencyKey: id, clusterId: 'cluster-a', term: 5, runtimeId: 'runtime-a', state: 'dispatched', attempt: 1, lastDispatchedAt: '2026-07-25T21:00:00.000Z', reason: 'dispatched', infrastructureMutationEnabled: false, readOnly: true, executable: false, ...overrides })
}

test('aggregates staged, dispatched, retrying, acknowledged, terminal, and stale states', () => {
  const instructions = [instruction('a'), instruction('b'), instruction('c'), instruction('d'), instruction('e'), instruction('f', 4)]
  const deliveries = [delivery('b'), delivery('c', { attempt: 2 }), delivery('d', { state: 'acknowledged', acknowledgedAt: '2026-07-25T21:01:00.000Z' }), delivery('e', { state: 'terminal', terminalReceiptState: 'verified' })]
  const result = createClusterDeliveryDiagnostics({ generatedAt: '2026-07-25T21:02:00.000Z', clusterId: 'cluster-a', currentTerm: 5, instructions, deliveries })
  assert.equal(result.counts.staged, 1)
  assert.equal(result.counts.dispatched, 1)
  assert.equal(result.counts.retrying, 1)
  assert.equal(result.counts.acknowledged, 1)
  assert.equal(result.counts.terminal, 1)
  assert.equal(result.counts['stale-term'], 1)
  assert.equal(result.status, 'critical')
  assert.equal(result.safety.runtimeExecutionControlsExposed, false)
})

test('is healthy when all instructions are acknowledged', () => {
  const result = createClusterDeliveryDiagnostics({ generatedAt: '2026-07-25T21:02:00.000Z', clusterId: 'cluster-a', currentTerm: 5, instructions: [instruction('a')], deliveries: [delivery('a', { state: 'acknowledged' })] })
  assert.equal(result.status, 'healthy')
})

test('rejects cluster and delivery identity mismatches', () => {
  assert.throws(() => createClusterDeliveryDiagnostics({ generatedAt: '2026-07-25T21:02:00.000Z', clusterId: 'cluster-b', currentTerm: 5, instructions: [instruction('a')], deliveries: [] }), /instruction mismatch/)
  assert.throws(() => createClusterDeliveryDiagnostics({ generatedAt: '2026-07-25T21:02:00.000Z', clusterId: 'cluster-a', currentTerm: 5, instructions: [instruction('a')], deliveries: [delivery('a', { term: 6 })] }), /record mismatch/)
})
