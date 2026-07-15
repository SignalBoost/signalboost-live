import test from 'node:test'
import assert from 'node:assert/strict'

import { issueBrowserApprovalToken } from '../lib/browser-runtime/approval.ts'
import {
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { resumeBrowserTask, runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const secret = 'resume-test-secret'
const now = new Date('2026-07-15T10:30:00.000Z')

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

function sign(task: BrowserTask, allowedStepIds: string[], phase: 1 | 2, nonce: string): string {
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
  }
  return issueBrowserApprovalToken(claims, secret)
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
    ['protected-save', 'wait-success', 'after-save'],
    2,
    'phase-2',
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

  const wrongToken = sign(task, ['wait-success', 'protected-save', 'after-save'], 2, 'wrong-order')
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

  const validToken = sign(task, ['protected-save', 'wait-success', 'after-save'], 2, 'valid-after-retry')
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
    ['protected-save', 'wait-success', 'after-save'],
    2,
    'tampered',
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
