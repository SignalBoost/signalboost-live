import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ClusterInstructionAcknowledgmentController,
  InMemoryClusterInstructionDeliveryStore,
} from '../agent-gateway/cluster-instruction-ack.ts'
import { createClusterRuntimeReceipt } from '../agent-gateway/cluster-runtime-receipts.ts'
import type { ClusterRuntimeInstruction } from '../agent-gateway/cluster-runtime-adapter.ts'

function instruction(term = 5): ClusterRuntimeInstruction {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1',
    instructionId: `gateway:${term}:promote:replica-b`,
    idempotencyKey: `gateway:${term}:promote:replica-b`,
    clusterId: 'gateway',
    term,
    replicaId: 'replica-b',
    action: 'promote',
    reason: 'committed promotion',
    requiresGovernedRuntime: true,
    infrastructureMutationEnabled: false,
    readOnly: true,
    executable: false,
  })
}

test('records dispatch attempts and retry-safe redelivery', async () => {
  const controller = new ClusterInstructionAcknowledgmentController(new InMemoryClusterInstructionDeliveryStore())
  const first = await controller.markDispatched(instruction(), 'runtime-a', new Date('2026-07-25T20:00:00Z'))
  const second = await controller.markDispatched(instruction(), 'runtime-a', new Date('2026-07-25T20:01:00Z'))
  assert.equal(first.attempt, 1)
  assert.equal(second.attempt, 2)
  assert.match(second.reason, /redelivered/)
})

test('records durable acknowledgment idempotently', async () => {
  const controller = new ClusterInstructionAcknowledgmentController(new InMemoryClusterInstructionDeliveryStore())
  const item = instruction()
  await controller.markDispatched(item, 'runtime-a')
  const receipt = createClusterRuntimeReceipt({ instruction: item, runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T20:02:00Z' })
  const first = await controller.acknowledge(receipt)
  const second = await controller.acknowledge(receipt)
  assert.equal(first.state, 'acknowledged')
  assert.strictEqual(first, second)
})

test('rejects stale receipts', async () => {
  const controller = new ClusterInstructionAcknowledgmentController(new InMemoryClusterInstructionDeliveryStore())
  const current = instruction(6)
  await controller.markDispatched(current, 'runtime-a')
  const staleReceipt = createClusterRuntimeReceipt({ instruction: instruction(5), runtimeId: 'runtime-a', state: 'acknowledged', observedAt: '2026-07-25T20:02:00Z' })
  await assert.rejects(() => controller.acknowledge({ ...staleReceipt, instructionId: current.instructionId } as never), /stale cluster receipt term/)
})

test('reconciles interrupted delivery into retry after grace period', async () => {
  const controller = new ClusterInstructionAcknowledgmentController(new InMemoryClusterInstructionDeliveryStore())
  const item = instruction()
  await controller.markDispatched(item, 'runtime-a', new Date('2026-07-25T20:00:00Z'))
  const decision = await controller.reconcile(item, 'runtime-a', 5, new Date('2026-07-25T20:02:00Z'), 30_000)
  assert.equal(decision.disposition, 'retry')
  assert.equal(decision.retrySafe, true)
})

test('rejects delivery from an older cluster term', async () => {
  const controller = new ClusterInstructionAcknowledgmentController(new InMemoryClusterInstructionDeliveryStore())
  const decision = await controller.reconcile(instruction(4), 'runtime-a', 5)
  assert.equal(decision.disposition, 'reject-stale-term')
  assert.equal(decision.retrySafe, false)
})
