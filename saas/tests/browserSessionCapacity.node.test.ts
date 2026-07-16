import test from 'node:test'
import assert from 'node:assert/strict'

import { issueBrowserApprovalToken } from '../lib/browser-runtime/approval.ts'
import {
  createBrowserExecutionId,
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserSessionPort, BrowserTask } from '../lib/browser-runtime/contracts.ts'

const signingSecret = 'browser-capacity-test-secret'
const now = new Date('2026-07-16T03:00:00.000Z')
const expiresAt = '2026-07-16T04:00:00.000Z'

function makeSession(closeCalls: string[], label: string): BrowserSessionPort {
  let currentUrl = 'about:blank'
  let closed = false
  return {
    page: {
      url: () => currentUrl,
      goto: async (url: string) => {
        currentUrl = url
      },
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    close: async () => {
      if (closed) return
      closed = true
      closeCalls.push(label)
    },
  }
}

function makeTask(suffix: string): BrowserTask {
  const task: BrowserTask = {
    taskId: `TASK-CAPACITY-${suffix}`,
    incidentId: `INC-CAPACITY-${suffix}`,
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-16T03:00:00.000Z',
    expiresAt,
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      {
        id: 'navigate',
        kind: 'navigate',
        url: 'https://sandbox.example.test/settings',
      },
      { id: 'ready', kind: 'screenshot', label: 'ready-before-save' },
      {
        id: 'approval-checkpoint',
        kind: 'checkpoint',
        label: 'Owner approval required',
        requiresApproval: true,
      },
      { id: 'protected-save', kind: 'click', selector: '#protected-save' },
      { id: 'wait-success', kind: 'wait_for', selector: '#save-success' },
      { id: 'after-save', kind: 'screenshot', label: 'after-save' },
    ],
    approvalToken: '',
  }

  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: ['navigate', 'ready', 'approval-checkpoint'],
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: `phase-one-${suffix}`,
    phase: 1,
    checkpointStepId: 'approval-checkpoint',
  }
  task.approvalToken = issueBrowserApprovalToken(claims, signingSecret)
  return task
}

function runtimePorts(closeCalls: string[], label: string) {
  return {
    sessions: {
      open: async () => makeSession(closeCalls, label),
    },
    context: {
      resolveSecretRef: async () => 'resolved',
      captureScreenshot: async (screenshotLabel: string) => `artifact://${screenshotLabel}`,
    },
  }
}

test('session registry requires a positive safe retention capacity', () => {
  assert.throws(
    () => new InMemoryBrowserSessionRegistry({ maxRetainedSessions: 0 }),
    /positive safe integer/,
  )
  assert.throws(
    () => new InMemoryBrowserSessionRegistry({ maxRetainedSessions: 1.5 }),
    /positive safe integer/,
  )
  assert.throws(
    () => new InMemoryBrowserSessionRegistry({
      maxRetainedSessions: Number.MAX_SAFE_INTEGER + 1,
    }),
    /positive safe integer/,
  )
})

test('capacity rejection closes only the rejected session and preserves retained state', async () => {
  const closeCalls: string[] = []
  const registry = new InMemoryBrowserSessionRegistry({ maxRetainedSessions: 1 })
  const first = makeSession(closeCalls, 'first')
  const second = makeSession(closeCalls, 'second')

  await registry.retain('execution-one', first, expiresAt, now)
  await assert.rejects(
    registry.retain('execution-two', second, expiresAt, now),
    /retention capacity reached \(1\)/,
  )

  assert.deepEqual(closeCalls, ['second'])
  assert.equal(await registry.take('execution-two'), null)
  assert.equal(await registry.take('execution-one'), first)
  assert.deepEqual(closeCalls, ['second'])
  await first.close()
})

test('runtime rolls back the serializable record when live-session capacity is exhausted', async () => {
  const closeCalls: string[] = []
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry({ maxRetainedSessions: 1 })
  const firstTask = makeTask('ONE')
  const secondTask = makeTask('TWO')
  const firstPorts = runtimePorts(closeCalls, 'first')
  const secondPorts = runtimePorts(closeCalls, 'second')

  const first = await runBrowserTask({
    task: firstTask,
    signingSecret,
    sessions: firstPorts.sessions,
    context: firstPorts.context,
    executionStore,
    sessionRegistry,
    now,
  })
  assert.equal(first.status, 'paused')
  assert.ok(first.executionId)

  const second = await runBrowserTask({
    task: secondTask,
    signingSecret,
    sessions: secondPorts.sessions,
    context: secondPorts.context,
    executionStore,
    sessionRegistry,
    now,
  })
  assert.equal(second.status, 'failed')
  assert.match(second.error || '', /retention capacity reached \(1\)/)
  assert.deepEqual(closeCalls, ['second'])

  const secondExecutionId = createBrowserExecutionId(secondTask, 'approval-checkpoint')
  assert.equal(await executionStore.load(secondExecutionId), null)
  assert.notEqual(await executionStore.load(first.executionId!), null)
  const retainedSession = await sessionRegistry.take(first.executionId!)
  assert.notEqual(retainedSession, null)
  await retainedSession?.close()

  await executionStore.delete(first.executionId!)
})

test('duplicate registry retention closes the rejected session without replacing the original', async () => {
  const closeCalls: string[] = []
  const registry = new InMemoryBrowserSessionRegistry({ maxRetainedSessions: 2 })
  const original = makeSession(closeCalls, 'original')
  const duplicate = makeSession(closeCalls, 'duplicate')

  await registry.retain('same-execution', original, expiresAt, now)
  await assert.rejects(
    registry.retain('same-execution', duplicate, expiresAt, now),
    /session already retained/,
  )

  assert.deepEqual(closeCalls, ['duplicate'])
  assert.equal(await registry.take('same-execution'), original)
  await original.close()
})
