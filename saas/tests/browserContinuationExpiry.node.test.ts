import test from 'node:test'
import assert from 'node:assert/strict'

import {
  digestBrowserApprovalToken,
  issueBrowserApprovalToken,
} from '../lib/browser-runtime/approval.ts'
import {
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { resumeBrowserTask, runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'
import type {
  BrowserExpiryHandle,
  BrowserExpiryScheduler,
} from '../lib/browser-runtime/execution-state.ts'

const secret = 'continuation-expiry-secret'
const now = new Date('2026-07-15T10:30:00.000Z')
const phaseOneStepIds = ['navigate', 'ready', 'approval-checkpoint']
const phaseTwoStepIds = ['protected-save', 'wait-success', 'after-save']

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

  runAll(): void {
    const callbacks = [...this.jobs.values()]
    this.jobs.clear()
    for (const callback of callbacks) callback()
  }
}

function makeTask(): BrowserTask {
  return {
    taskId: 'TASK-EXPIRY-001',
    incidentId: 'INC-EXPIRY-001',
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-15T10:00:00.000Z',
    expiresAt: '2026-07-15T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
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
}

function signPhaseOne(task: BrowserTask): string {
  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: phaseOneStepIds,
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: 'phase-one-expiry',
    phase: 1,
    checkpointStepId: 'approval-checkpoint',
  }
  return issueBrowserApprovalToken(claims, secret)
}

function signPhaseTwo(task: BrowserTask, executionId: string): string {
  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: phaseTwoStepIds,
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: 'phase-two-expiry',
    phase: 2,
    checkpointStepId: 'approval-checkpoint',
    executionId,
    preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
  }
  return issueBrowserApprovalToken(claims, secret)
}

function ports(calls: string[]) {
  let currentUrl = 'about:blank'
  let closeCount = 0

  return {
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async (url: string) => {
              currentUrl = url
              calls.push(`goto:${url}`)
            },
            click: async (selector: string) => {
              calls.push(`click:${selector}`)
            },
            fill: async (selector: string) => {
              calls.push(`fill:${selector}`)
            },
            waitForSelector: async (selector: string) => {
              calls.push(`wait:${selector}`)
            },
          },
          close: async () => {
            closeCount += 1
            calls.push('close')
          },
        }
      },
    },
    context: {
      resolveSecretRef: async (ref: string) => {
        calls.push(`secret:${ref}`)
        return 'resolved'
      },
      captureScreenshot: async (label: string) => {
        calls.push(`screenshot:${label}`)
        return `artifact://${label}`
      },
    },
    closeCount: () => closeCount,
  }
}

async function pauseExecution() {
  const calls: string[] = []
  const task = makeTask()
  task.approvalToken = signPhaseOne(task)
  const scheduler = new ManualExpiryScheduler()
  const executionStore = new InMemoryBrowserExecutionStore({ scheduler })
  const sessionRegistry = new InMemoryBrowserSessionRegistry({ scheduler })
  const runtimePorts = ports(calls)

  const paused = await runBrowserTask({
    task,
    signingSecret: secret,
    sessions: runtimePorts.sessions,
    context: runtimePorts.context,
    executionStore,
    sessionRegistry,
    now,
  })

  assert.equal(paused.status, 'paused')
  assert.ok(paused.executionId)

  return {
    calls,
    task,
    scheduler,
    executionStore,
    sessionRegistry,
    runtimePorts,
    executionId: paused.executionId,
  }
}

test('retained execution records and live sessions expire together', async () => {
  const fixture = await pauseExecution()
  const record = await fixture.executionStore.load(fixture.executionId)

  assert.equal(record?.expiresAt, fixture.task.expiresAt)
  assert.equal(fixture.runtimePorts.closeCount(), 0)
  assert.equal(fixture.scheduler.size, 2)

  fixture.scheduler.runAll()
  await Promise.resolve()

  assert.equal(await fixture.executionStore.load(fixture.executionId), null)
  assert.equal(await fixture.sessionRegistry.take(fixture.executionId), null)
  assert.equal(fixture.runtimePorts.closeCount(), 1)
  assert.equal(fixture.scheduler.size, 0)
})

test('resume after the retained execution expiry fails closed and removes state', async () => {
  const fixture = await pauseExecution()
  const secondApprovalToken = signPhaseTwo(fixture.task, fixture.executionId)

  const rejected = await resumeBrowserTask({
    task: fixture.task,
    executionId: fixture.executionId,
    secondApprovalToken,
    signingSecret: secret,
    executionStore: fixture.executionStore,
    sessionRegistry: fixture.sessionRegistry,
    context: fixture.runtimePorts.context,
    now: new Date(fixture.task.expiresAt),
  })

  assert.equal(rejected.status, 'failed')
  assert.match(rejected.error || '', /execution expired/)
  assert.equal(fixture.calls.some(call => call.startsWith('click:')), false)
  assert.equal(fixture.runtimePorts.closeCount(), 1)
  assert.equal(await fixture.executionStore.load(fixture.executionId), null)
  assert.equal(await fixture.sessionRegistry.take(fixture.executionId), null)
  assert.equal(fixture.scheduler.size, 0)
})

test('a missing execution record discards any orphaned retained session', async () => {
  const fixture = await pauseExecution()
  const secondApprovalToken = signPhaseTwo(fixture.task, fixture.executionId)
  await fixture.executionStore.delete(fixture.executionId)

  const rejected = await resumeBrowserTask({
    task: fixture.task,
    executionId: fixture.executionId,
    secondApprovalToken,
    signingSecret: secret,
    executionStore: fixture.executionStore,
    sessionRegistry: fixture.sessionRegistry,
    context: fixture.runtimePorts.context,
    now,
  })

  assert.equal(rejected.status, 'failed')
  assert.match(rejected.error || '', /record is missing/)
  assert.equal(fixture.calls.some(call => call.startsWith('click:')), false)
  assert.equal(fixture.runtimePorts.closeCount(), 1)
  assert.equal(await fixture.sessionRegistry.take(fixture.executionId), null)
  assert.equal(fixture.scheduler.size, 0)
})
