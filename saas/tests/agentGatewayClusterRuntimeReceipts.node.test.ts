import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClusterRuntimeReceiptController,
  InMemoryClusterRuntimeReceiptStore,
  createClusterRuntimeReceipt,
  type ClusterRuntimeInstruction,
} from '../agent-gateway/index.ts'

const instruction: ClusterRuntimeInstruction = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1',
  instructionId: 'gateway-us-east:5:promote:gateway-b',
  clusterId: 'gateway-us-east',
  term: 5,
  replicaId: 'gateway-b',
  action: 'promote',
  reason: 'committed cluster leader promotion',
  idempotencyKey: 'gateway-us-east:5:promote:gateway-b',
  requiresGovernedRuntime: true,
  infrastructureMutationEnabled: false,
  readOnly: true,
  executable: false,
})

test('creates immutable non-executable runtime receipts', () => {
  const receipt = createClusterRuntimeReceipt({
    instruction,
    runtimeId: 'runtime-a',
    state: 'acknowledged',
    observedAt: '2026-07-25T21:10:00Z',
    evidenceRef: 'audit/runtime-a/ack-1',
  })
  assert.equal(receipt.instructionId, instruction.instructionId)
  assert.equal(receipt.infrastructureMutationEnabled, false)
  assert.equal(receipt.executable, false)
  assert.ok(Object.isFrozen(receipt))
})

test('records acknowledgement and verification in order', async () => {
  const store = new InMemoryClusterRuntimeReceiptStore()
  const controller = new ClusterRuntimeReceiptController(store)
  await controller.record({ instruction, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T21:10:00Z' })
  const verified = await controller.record({ instruction, runtimeId: 'runtime-a', state: 'verified', observedAt: '2026-07-25T21:10:05Z', evidenceRef: 'audit/runtime-a/verify-1' })
  assert.equal(verified.state, 'verified')
  assert.equal((await store.listByInstruction(instruction.instructionId)).length, 2)
})

test('duplicate receipt recording is idempotent', async () => {
  const controller = new ClusterRuntimeReceiptController(new InMemoryClusterRuntimeReceiptStore())
  const input = { instruction, runtimeId: 'runtime-a', state: 'acknowledged' as const, observedAt: '2026-07-25T21:10:00Z' }
  const first = await controller.record(input)
  const second = await controller.record(input)
  assert.strictEqual(first, second)
})

test('conflicting terminal states fail closed', async () => {
  const controller = new ClusterRuntimeReceiptController(new InMemoryClusterRuntimeReceiptStore())
  await controller.record({ instruction, runtimeId: 'runtime-a', state: 'rejected', observedAt: '2026-07-25T21:10:00Z', reason: 'runtime policy denied instruction' })
  await assert.rejects(
    () => controller.record({ instruction, runtimeId: 'runtime-a', state: 'verified', observedAt: '2026-07-25T21:10:05Z' }),
    /terminal state conflict/,
  )
})

test('unsafe or malformed instructions and evidence are rejected', () => {
  assert.throws(() => createClusterRuntimeReceipt({ instruction: {} as ClusterRuntimeInstruction, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T21:10:00Z' }), /invalid cluster runtime instruction/)
  assert.throws(() => createClusterRuntimeReceipt({ instruction: { ...instruction, executable: true } as unknown as ClusterRuntimeInstruction, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T21:10:00Z' }), /unsafe cluster runtime instruction/)
  assert.throws(() => createClusterRuntimeReceipt({ instruction, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: 'invalid' }), /observedAt/)
  assert.throws(() => createClusterRuntimeReceipt({ instruction, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T21:10:00Z', evidenceRef: 'bad evidence value' }), /evidenceRef/)
})
