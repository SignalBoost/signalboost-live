import test from 'node:test'
import assert from 'node:assert/strict'

import {
  digestBrowserApprovalToken,
  issueBrowserApprovalToken,
} from '../lib/browser-runtime/approval.ts'
import {
  createBrowserExecutionId,
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { resumeBrowserTask, runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const secret = 'resume-test-secret'
const now = new Date('2026-07-15T10:30:00.000Z')
const remainingStepIds = ['protected-save', 'wait-success', 'after-save']

interface ContinuationScope {
  executionId: string
  preApprovalTokenDigest: string
}

function makeTask(): BrowserTask {
  return {
    taskId: 'TASK-RESUME-001',
    incidentId: 'INC-RESUME-001',
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-15T10:00:00.000Z',
    expiresAt: '2026-07-15T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'ready', kind: 'screenshot', label: 'ready-before-save' },
      { id: 'approval-checkpoint', kind: 'checkpoint', label: 'Owner approval required', requiresApproval: true },
      { id: 'protected-save', kind: 'click', selector: '#protected-save' },
      { id: 'wait-success', kind: 'wait_for', selector: '#save-success' },
      { id: 'after-save', kind: 'screenshot', label: 'after-save' },
    ],
    approvalToken: '',
  }
}

function sign(
  task: BrowserTask,
  allowedStepIds: string[],
  phase: 1 | 2,
  nonce: string,
  continuation?: ContinuationScope,
): string {
  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds,
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce,
    phase,
    checkpointStepId: 'approval-checkpoint',
    executionId: continuation?.executionId,
    preApprovalTokenDigest: continuation?.preApprovalTokenDigest,
  }
  return issueBrowserApprovalToken(claims, secret)
}

function continuationScope(task: BrowserTask, executionId: string): ContinuationScope {
  return {
    executionId,
    preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
  }
}

function ports(calls: string[]) {
  let currentUrl = 'about:blank'
  let closed = false
  return {
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async (url: string) => { currentUrl = url; calls.push(`goto:${url}`) },
            click: async (selector: string) => { calls.push(`click:${selector}`) },
            fill: async (selector: string) => { calls.push(`fill:${selector}`) },
            waitForSelector: async (selector: string) => { calls.push(`wait:${selector}`) },
          },
          close: async () => { closed = true; calls.push('close') },
        }
      },
    },
    context: {
      resolveSecretRef: async (ref: string) => { calls.push(`secret:${ref}`); return 'resolved' },
      captureScreenshot: async (label: string) => { calls.push(`screenshot:${label}`); return `artifact://${label}` },
    },
    wasClosed: () => closed,
  }
}

test('resumable execution pauses, resumes exact remaining steps, and verifies completion', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.approvalToken = sign(task, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1')
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
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
  assert.equal(runtimePorts.wasClosed(), false)
  assert.deepEqual(calls, [
    'goto:https://sandbox.example.test/settings',
    'screenshot:ready-before-save',
  ])
  assert.notEqual(paused.verification, 'pending')
  if (paused.verification !== 'pending') assert.equal(paused.verification.status, 'verified')

  const secondApprovalToken = sign(
    task,
    remainingStepIds,
    2,
    'phase-2',
    continuationScope(task, paused.executionId!),
  )
  const completed = await resumeBrowserTask({
    task,
    executionId: paused.executionId!,
    secondApprovalToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })

  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.completedStepIds, [
    'navigate',
    'ready',
    'protected-save',
    'wait-success',
    'after-save',
  ])
  assert.equal(calls.filter(call => call.startsWith('goto:')).length, 1)
  assert.deepEqual(calls.slice(2), [
    'click:#protected-save',
    'wait:#save-success',
    'screenshot:after-save',
    'close',
  ])
  assert.equal(runtimePorts.wasClosed(), true)
  assert.notEqual(completed.verification, 'pending')
  if (completed.verification !== 'pending') assert.equal(completed.verification.status, 'verified')
  assert.equal(await executionStore.load(paused.executionId!), null)
})

test('invalid second approval does not execute or consume the retained session', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.approvalToken = sign(task, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-invalid')
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
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
  assert.ok(paused.executionId)

  const scope = continuationScope(task, paused.executionId!)
  const wrongToken = sign(task, ['wait-success', 'protected-save', 'after-save'], 2, 'wrong-order', scope)
  const rejected = await resumeBrowserTask({
    task,
    executionId: paused.executionId!,
    secondApprovalToken: wrongToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })

  assert.equal(rejected.status, 'failed')
  assert.match(rejected.error || '', /exact browser steps/)
  assert.equal(calls.some(call => call.startsWith('click:')), false)
  assert.equal(runtimePorts.wasClosed(), false)
  assert.notEqual(await executionStore.load(paused.executionId!), null)

  const validToken = sign(task, remainingStepIds, 2, 'valid-after-retry', scope)
  const completed = await resumeBrowserTask({
    task,
    executionId: paused.executionId!,
    secondApprovalToken: validToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })
  assert.equal(completed.status, 'completed')
})

test('task tampering invalidates and closes the retained execution', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.approvalToken = sign(task, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-tamper')
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
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
  assert.ok(paused.executionId)

  const tamperedTask = structuredClone(task)
  tamperedTask.steps[3] = { id: 'protected-save', kind: 'click', selector: '#different-target' }
  const secondApprovalToken = sign(
    tamperedTask,
    remainingStepIds,
    2,
    'tampered',
    continuationScope(task, paused.executionId!),
  )
  const rejected = await resumeBrowserTask({
    task: tamperedTask,
    executionId: paused.executionId!,
    secondApprovalToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })

  assert.equal(rejected.status, 'failed')
  assert.match(rejected.error || '', /fingerprint mismatch/)
  assert.equal(runtimePorts.wasClosed(), true)
  assert.equal(await executionStore.load(paused.executionId!), null)
})

test('phase-two approval cannot be replayed across distinct paused executions', async () => {
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
  const callsA: string[] = []
  const callsB: string[] = []
  const portsA = ports(callsA)
  const portsB = ports(callsB)
  const taskA = makeTask()
  const taskB = makeTask()
  taskA.approvalToken = sign(taskA, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-A')
  taskB.approvalToken = sign(taskB, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-B')

  const pausedA = await runBrowserTask({
    task: taskA,
    signingSecret: secret,
    sessions: portsA.sessions,
    context: portsA.context,
    executionStore,
    sessionRegistry,
    now,
  })
  const pausedB = await runBrowserTask({
    task: taskB,
    signingSecret: secret,
    sessions: portsB.sessions,
    context: portsB.context,
    executionStore,
    sessionRegistry,
    now,
  })

  assert.ok(pausedA.executionId)
  assert.ok(pausedB.executionId)
  assert.notEqual(pausedA.executionId, pausedB.executionId)

  const tokenForA = sign(
    taskA,
    remainingStepIds,
    2,
    'phase-2-A',
    continuationScope(taskA, pausedA.executionId!),
  )
  const rejectedB = await resumeBrowserTask({
    task: taskB,
    executionId: pausedB.executionId!,
    secondApprovalToken: tokenForA,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: portsB.context,
    now,
  })

  assert.equal(rejectedB.status, 'failed')
  assert.match(rejectedB.error || '', /execution scope mismatch/)
  assert.equal(callsB.some(call => call.startsWith('click:')), false)
  assert.equal(portsB.wasClosed(), false)
  assert.notEqual(await executionStore.load(pausedB.executionId!), null)

  const tokenForB = sign(
    taskB,
    remainingStepIds,
    2,
    'phase-2-B',
    continuationScope(taskB, pausedB.executionId!),
  )
  const completedB = await resumeBrowserTask({
    task: taskB,
    executionId: pausedB.executionId!,
    secondApprovalToken: tokenForB,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: portsB.context,
    now,
  })
  assert.equal(completedB.status, 'completed')

  const tokenForACleanup = sign(
    taskA,
    remainingStepIds,
    2,
    'phase-2-A-cleanup',
    continuationScope(taskA, pausedA.executionId!),
  )
  const completedA = await resumeBrowserTask({
    task: taskA,
    executionId: pausedA.executionId!,
    secondApprovalToken: tokenForACleanup,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: portsA.context,
    now,
  })
  assert.equal(completedA.status, 'completed')
})

test('changing the phase-one approval invalidates the retained execution', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.approvalToken = sign(task, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-original')
  const originalPreApprovalToken = task.approvalToken
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
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
  assert.ok(paused.executionId)

  const swappedTask = structuredClone(task)
  swappedTask.approvalToken = sign(
    swappedTask,
    ['navigate', 'ready', 'approval-checkpoint'],
    1,
    'phase-1-replacement',
  )
  const secondApprovalToken = sign(
    swappedTask,
    remainingStepIds,
    2,
    'phase-2-after-swap',
    {
      executionId: paused.executionId!,
      preApprovalTokenDigest: digestBrowserApprovalToken(originalPreApprovalToken),
    },
  )

  const rejected = await resumeBrowserTask({
    task: swappedTask,
    executionId: paused.executionId!,
    secondApprovalToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })

  assert.equal(rejected.status, 'failed')
  assert.match(rejected.error || '', /task approval|pre-approval token/)
  assert.equal(calls.some(call => call.startsWith('click:')), false)
  assert.equal(runtimePorts.wasClosed(), true)
  assert.equal(await executionStore.load(paused.executionId!), null)
})

test('unverified phase one never retains a resumable execution or session', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.steps.splice(3, 0, {
    id: 'unexpected-second-checkpoint',
    kind: 'checkpoint',
    label: 'This invalidates the bounded phase-one shape',
    requiresApproval: true,
  })
  task.approvalToken = sign(task, ['navigate', 'ready', 'approval-checkpoint'], 1, 'phase-1-unverified')
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
  const runtimePorts = ports(calls)
  const expectedExecutionId = createBrowserExecutionId(task, 'approval-checkpoint')

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
  assert.equal(paused.executionId, undefined)
  assert.notEqual(paused.verification, 'pending')
  if (paused.verification !== 'pending') assert.equal(paused.verification.status, 'failed')
  assert.equal(runtimePorts.wasClosed(), true)
  assert.equal(calls.some(call => call.startsWith('click:')), false)
  assert.equal(await executionStore.load(expectedExecutionId), null)
})
