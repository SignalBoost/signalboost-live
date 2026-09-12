import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryCoordinationStore, OwnershipError } from '../lib/supervisor/coordination/index.ts'
import { assertSpecialistMeshOwnership, claimSpecialistMeshTask, completeSpecialistMeshTask, ensureSpecialistMeshTask, reconcileSpecialistMeshTakeovers, registerSpecialistMeshWorker, startSpecialistMeshTask, verifySpecialistMeshTask } from '../a2a-host/specialist-mesh-coordination.ts'

const t0 = new Date('2026-09-12T18:00:00.000Z')
const workerA = { agentId: 'software-a', instanceId: 'mesh-software-a', runtimeId: 'runtime-a' }
const workerB = { agentId: 'software-b', instanceId: 'mesh-software-b', runtimeId: 'runtime-b' }

async function setup() {
  const store = new InMemoryCoordinationStore()
  await registerSpecialistMeshWorker(store, workerA, { softwareVersion: 'test', now: t0 })
  await registerSpecialistMeshWorker(store, workerB, { softwareVersion: 'test', now: t0 })
  await ensureSpecialistMeshTask(store, { taskId: 'task-1', tenantId: 'tenant-a', environment: 'production', policyVersion: 'policy-1' }, t0)
  return store
}

test('only an eligible mesh specialist can claim a task', async () => {
  const store = await setup()
  await assert.rejects(
    claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerA, eligibleAgentIds: ['software-b'], now: t0 }),
    (error: unknown) => error instanceof OwnershipError && error.code === 'mesh_worker_not_eligible',
  )
})

test('a live lease prevents another specialist from executing the same task', async () => {
  const store = await setup()
  await claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerA, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 1_000, now: t0 })
  await assert.rejects(
    claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerB, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 1_000, now: new Date(t0.getTime() + 500) }),
    (error: unknown) => error instanceof OwnershipError && error.code === 'lease_conflict',
  )
})

test('expired owner is fenced out and another eligible specialist takes over', async () => {
  const store = await setup()
  const first = await claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerA, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 1_000, now: t0 })
  const afterExpiry = new Date(t0.getTime() + 1_001)
  const recovered = await reconcileSpecialistMeshTakeovers(store, afterExpiry)
  assert.deepEqual(recovered.map(item => item.workItemId), ['specialist-mesh:task-1'])

  const second = await claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerB, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 1_000, now: afterExpiry })
  assert.ok(second.fencingToken > first.fencingToken)

  await assert.rejects(
    assertSpecialistMeshOwnership(store, 'task-1', first, afterExpiry),
    (error: unknown) => error instanceof OwnershipError && error.code === 'stale_owner_rejected',
  )
  await assert.doesNotReject(assertSpecialistMeshOwnership(store, 'task-1', second, afterExpiry))
})

test('only the current fenced owner can move the task through processing verification and completion', async () => {
  const store = await setup()
  const first = await claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerA, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 1_000, now: t0 })
  const afterExpiry = new Date(t0.getTime() + 1_001)
  await reconcileSpecialistMeshTakeovers(store, afterExpiry)
  const second = await claimSpecialistMeshTask(store, { taskId: 'task-1', worker: workerB, eligibleAgentIds: ['software-a', 'software-b'], leaseDurationMs: 5_000, now: afterExpiry })

  await assert.rejects(startSpecialistMeshTask(store, 'task-1', first, 'execution-stale', afterExpiry))
  const processing = await startSpecialistMeshTask(store, 'task-1', second, 'execution-b', afterExpiry)
  assert.equal(processing.state, 'processing')
  const verificationPending = await verifySpecialistMeshTask(store, 'task-1', second, 'execution-b', afterExpiry)
  assert.equal(verificationPending.state, 'verification_pending')
  await assert.rejects(completeSpecialistMeshTask(store, 'task-1', first, 'execution-stale', afterExpiry))
  const completed = await completeSpecialistMeshTask(store, 'task-1', second, 'execution-b', afterExpiry)
  assert.equal(completed.state, 'completed')
  assert.equal(completed.executionId, 'execution-b')
  assert.equal(completed.attempt, 2)
})
