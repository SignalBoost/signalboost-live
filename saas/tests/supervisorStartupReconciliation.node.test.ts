import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InMemoryCoordinationStore,
  ownershipIdentity,
  runSupervisorStartupReconciliation,
  scheduleSupervisorReconciliation,
  type SupervisorInstance,
  type WorkItem,
} from '../lib/supervisor/coordination/index.ts'

const instance: SupervisorInstance = {
  instanceId: 'supervisor-a',
  runtimeId: 'runtime-a',
  startedAt: '2026-07-18T00:00:00.000Z',
  heartbeatAt: '2026-07-18T00:00:00.000Z',
  softwareVersion: '1.0.0',
  schemaVersion: 'supervisor-instance-v1',
  supportedProviderKinds: ['vercel'],
  status: 'healthy',
}

function work(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    workItemId: 'work-1',
    workItemType: 'browser_continuation',
    incidentId: 'incident-1',
    executionId: 'execution-1',
    provider: 'vercel',
    environment: 'sandbox',
    state: 'queued',
    priority: 10,
    createdAt: '2026-07-18T00:00:00.000Z',
    availableAt: '2026-07-18T00:00:00.000Z',
    attempt: 0,
    maxAttempts: 3,
    policyVersion: 'policy-v1',
    schemaVersion: 'supervisor-work-item-v1',
    ...overrides,
  }
}

test('startup reconciliation requeues expired work and invalidates its continuation approval', async () => {
  const store = new InMemoryCoordinationStore()
  await store.registerInstance(instance)
  await store.enqueueWorkItem(work())
  const lease = await store.acquireLease({
    workItemId: 'work-1',
    ownerInstanceId: instance.instanceId,
    ownerRuntimeId: instance.runtimeId,
    leaseDurationMs: 1_000,
    now: new Date('2026-07-18T00:00:00.000Z'),
  })
  await store.transitionWorkItem({
    workItemId: 'work-1',
    from: 'leased',
    to: 'paused_for_approval',
    owner: ownershipIdentity(lease),
    now: new Date('2026-07-18T00:00:00.500Z'),
  })

  const invalidations: unknown[] = []
  const report = await runSupervisorStartupReconciliation({
    store,
    now: new Date('2026-07-18T00:00:02.000Z'),
    approvalInvalidator: { invalidate: async input => { invalidations.push(input) } },
  })

  assert.deepEqual(report.reconciledWorkItemIds, ['work-1'])
  assert.deepEqual(report.invalidatedExecutionIds, ['execution-1'])
  assert.equal(report.schemaVersion, 'supervisor-startup-reconciliation-v1')
  assert.deepEqual(invalidations, [{
    executionId: 'execution-1',
    workItemId: 'work-1',
    reason: 'coordination_lease_expired',
    invalidatedAt: '2026-07-18T00:00:02.000Z',
  }])
  assert.equal((await store.getWorkItem('work-1'))?.state, 'queued')
})

test('reconciliation is idempotent and does not invalidate the same execution twice', async () => {
  const store = new InMemoryCoordinationStore()
  await store.registerInstance(instance)
  await store.enqueueWorkItem(work())
  await store.acquireLease({
    workItemId: 'work-1',
    ownerInstanceId: instance.instanceId,
    ownerRuntimeId: instance.runtimeId,
    leaseDurationMs: 1_000,
    now: new Date('2026-07-18T00:00:00.000Z'),
  })

  let invalidationCount = 0
  const approvalInvalidator = { invalidate: async () => { invalidationCount += 1 } }
  await runSupervisorStartupReconciliation({ store, approvalInvalidator, now: new Date('2026-07-18T00:00:02.000Z') })
  const second = await runSupervisorStartupReconciliation({ store, approvalInvalidator, now: new Date('2026-07-18T00:00:03.000Z') })

  assert.equal(invalidationCount, 1)
  assert.deepEqual(second.reconciledWorkItemIds, [])
  assert.deepEqual(second.invalidatedExecutionIds, [])
})

test('one lost execution invalidates once even when multiple expired work items reference it', async () => {
  const store = new InMemoryCoordinationStore()
  await store.registerInstance(instance)
  await store.enqueueWorkItem(work({ workItemId: 'work-2', incidentId: 'incident-2' }))
  await store.enqueueWorkItem(work({ workItemId: 'work-1', incidentId: 'incident-1' }))

  for (const workItemId of ['work-1', 'work-2']) {
    await store.acquireLease({
      workItemId,
      ownerInstanceId: instance.instanceId,
      ownerRuntimeId: instance.runtimeId,
      leaseDurationMs: 1_000,
      now: new Date('2026-07-18T00:00:00.000Z'),
    })
  }

  const invalidations: Array<{ executionId: string; workItemId: string }> = []
  const report = await runSupervisorStartupReconciliation({
    store,
    now: new Date('2026-07-18T00:00:02.000Z'),
    approvalInvalidator: {
      invalidate: async ({ executionId, workItemId }) => { invalidations.push({ executionId, workItemId }) },
    },
  })

  assert.deepEqual(report.reconciledWorkItemIds, ['work-1', 'work-2'])
  assert.deepEqual(report.invalidatedExecutionIds, ['execution-1'])
  assert.deepEqual(invalidations, [{ executionId: 'execution-1', workItemId: 'work-1' }])
})

test('approval invalidation failure rejects reconciliation instead of reporting a safe completion', async () => {
  const store = new InMemoryCoordinationStore()
  await store.registerInstance(instance)
  await store.enqueueWorkItem(work())
  await store.acquireLease({
    workItemId: 'work-1',
    ownerInstanceId: instance.instanceId,
    ownerRuntimeId: instance.runtimeId,
    leaseDurationMs: 1_000,
    now: new Date('2026-07-18T00:00:00.000Z'),
  })

  await assert.rejects(
    runSupervisorStartupReconciliation({
      store,
      now: new Date('2026-07-18T00:00:02.000Z'),
      approvalInvalidator: { invalidate: async () => { throw new Error('invalidation_failed') } },
    }),
    /invalidation_failed/,
  )
})

test('scheduler runs immediately and can be stopped', async () => {
  const store = new InMemoryCoordinationStore()
  let runs = 0
  const scheduler = scheduleSupervisorReconciliation({
    store,
    approvalInvalidator: { invalidate: async () => undefined },
    intervalMs: 60_000,
    now: () => new Date('2026-07-18T00:00:00.000Z'),
    onReport: () => { runs += 1 },
  })

  const report = await scheduler.ready
  scheduler.stop()
  assert.equal(runs, 1)
  assert.deepEqual(report.reconciledWorkItemIds, [])
})

test('invalid interval fails closed', () => {
  const store = new InMemoryCoordinationStore()
  assert.throws(() => scheduleSupervisorReconciliation({
    store,
    approvalInvalidator: { invalidate: async () => undefined },
    intervalMs: 999,
  }), /reconciliation_interval_invalid/)
})
