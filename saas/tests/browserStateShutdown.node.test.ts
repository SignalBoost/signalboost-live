// saas/tests/browserStateShutdown.node.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'

import { SANDBOX_ADAPTER_ID } from '../lib/browser-runtime/adapter-identifiers.ts'
import {
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import type {
  BrowserExecutionRecord,
  BrowserExpiryHandle,
  BrowserExpiryScheduler,
} from '../lib/browser-runtime/execution-state.ts'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'

const retainedAt = new Date('2026-07-16T04:00:00.000Z')
const expiresAt = '2026-07-16T05:00:00.000Z'

class ManualExpiryScheduler implements BrowserExpiryScheduler {
  private nextId = 1
  private readonly jobs = new Map<number, () => void>()

  schedule(callback: () => void, _delayMs: number): BrowserExpiryHandle {
    const id = this.nextId
    this.nextId += 1
    this.jobs.set(id, callback)
    return {
      cancel: () => {
        this.jobs.delete(id)
      },
    }
  }

  get size(): number {
    return this.jobs.size
  }
}

function makeRecord(executionId: string): BrowserExecutionRecord {
  return {
    executionId,
    taskId: `TASK-${executionId}`,
    incidentId: `INC-${executionId}`,
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    checkpointStepId: 'approval-checkpoint',
    startedAt: retainedAt.toISOString(),
    expiresAt,
    completedStepIds: ['navigate'],
    remainingSteps: [
      { id: 'protected-save', kind: 'click', selector: '#protected-save' },
    ],
    allowedOrigins: ['https://sandbox.example.test'],
    preApprovalTokenDigest: `digest-${executionId}`,
    taskFingerprint: `fingerprint-${executionId}`,
    evidence: [],
  }
}

function makeSession(
  closeCalls: string[],
  label: string,
  options: { rejectClose?: boolean; throwClose?: boolean } = {},
): BrowserSessionPort {
  return {
    page: {
      url: () => 'https://sandbox.example.test/settings',
      goto: async () => undefined,
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    close: () => {
      closeCalls.push(label)
      if (options.throwClose) throw new Error(`close threw: ${label}`)
      if (options.rejectClose) return Promise.reject(new Error(`close rejected: ${label}`))
      return Promise.resolve()
    },
  }
}

test('execution store shutdown clears records, cancels timers, and rejects new retention', async () => {
  const scheduler = new ManualExpiryScheduler()
  const store = new InMemoryBrowserExecutionStore({ scheduler })
  const first = makeRecord('execution-one')

  await store.save(first, retainedAt)
  assert.equal(scheduler.size, 1)
  assert.deepEqual(await store.load(first.executionId), first)

  await store.shutdown()
  await store.shutdown()

  assert.equal(scheduler.size, 0)
  assert.equal(await store.load(first.executionId), null)
  await assert.rejects(
    store.save(makeRecord('execution-two'), retainedAt),
    /execution store is shut down/,
  )
})

test('session registry shutdown closes every session, cancels timers, and is idempotent', async () => {
  const scheduler = new ManualExpiryScheduler()
  const closeCalls: string[] = []
  const registry = new InMemoryBrowserSessionRegistry({ scheduler })

  await registry.retain(
    'execution-one',
    makeSession(closeCalls, 'first', { throwClose: true }),
    expiresAt,
    retainedAt,
  )
  await registry.retain(
    'execution-two',
    makeSession(closeCalls, 'second', { rejectClose: true }),
    expiresAt,
    retainedAt,
  )
  await registry.retain(
    'execution-three',
    makeSession(closeCalls, 'third'),
    expiresAt,
    retainedAt,
  )
  assert.equal(scheduler.size, 3)

  const firstShutdown = registry.shutdown()
  const secondShutdown = registry.shutdown()
  assert.equal(firstShutdown, secondShutdown)
  await firstShutdown

  assert.deepEqual(closeCalls, ['first', 'second', 'third'])
  assert.equal(scheduler.size, 0)
  assert.equal(await registry.take('execution-one'), null)
  assert.equal(await registry.take('execution-two'), null)
  assert.equal(await registry.take('execution-three'), null)

  await registry.shutdown()
  assert.deepEqual(closeCalls, ['first', 'second', 'third'])
})

test('session registry rejects and closes sessions retained after shutdown begins', async () => {
  const scheduler = new ManualExpiryScheduler()
  const closeCalls: string[] = []
  const registry = new InMemoryBrowserSessionRegistry({ scheduler })

  await registry.shutdown()

  await assert.rejects(
    registry.retain(
      'execution-after-shutdown',
      makeSession(closeCalls, 'rejected'),
      expiresAt,
      retainedAt,
    ),
    /session registry is shut down/,
  )

  assert.deepEqual(closeCalls, ['rejected'])
  assert.equal(scheduler.size, 0)
  assert.equal(await registry.take('execution-after-shutdown'), null)
})
