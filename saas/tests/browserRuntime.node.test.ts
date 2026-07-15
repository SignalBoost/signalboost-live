import test from 'node:test'
import assert from 'node:assert/strict'
import { issueBrowserApprovalToken } from '../lib/browser-runtime/approval.ts'
import { runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const secret = 'test-signing-secret'

function signTask(task: BrowserTask, nonce: string): BrowserTask {
  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: task.steps.map(step => step.id),
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce,
  }

  task.approvalToken = issueBrowserApprovalToken(claims, secret)
  return task
}

function makeTask(): BrowserTask {
  return signTask({
    taskId: 'TASK-001',
    incidentId: 'INC-001',
    provider: 'sandbox',
    adapterId: 'sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-15T10:00:00.000Z',
    expiresAt: '2026-07-15T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'wait', kind: 'wait_for', selector: '#environment-variable-form' },
      { id: 'shot', kind: 'screenshot', label: 'Environment variable form before change' },
      { id: 'approval-checkpoint', kind: 'checkpoint', label: 'Owner approval required before entering or saving a value', requiresApproval: true },
      { id: 'fill', kind: 'fill', selector: '#value', valueRef: 'vault://test/value' },
    ],
    approvalToken: '',
  }, 'nonce-001')
}

test('browser runtime pauses at the approval checkpoint and never executes later steps', async () => {
  const calls: string[] = []
  const task = makeTask()
  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: {
      async open() {
        return {
          page: {
            url: () => 'https://sandbox.example.test/settings',
            goto: async url => { calls.push(`goto:${url}`) },
            click: async selector => { calls.push(`click:${selector}`) },
            fill: async selector => { calls.push(`fill:${selector}`) },
            waitForSelector: async selector => { calls.push(`wait:${selector}`) },
          },
          close: async () => { calls.push('close') },
        }
      },
    },
    context: {
      resolveSecretRef: async ref => { calls.push(`secret:${ref}`); return 'never-used' },
      captureScreenshot: async label => { calls.push(`screenshot:${label}`); return 'artifact://shot-1' },
    },
  })

  assert.equal(result.status, 'paused')
  assert.equal(result.pausedAtStepId, 'approval-checkpoint')
  assert.equal(calls.some(call => call.startsWith('fill:')), false)
  assert.equal(calls.some(call => call.startsWith('secret:')), false)
  assert.equal(calls.at(-1), 'close')
})

test('browser runtime rejects a task when the signed incident does not match', async () => {
  const task = makeTask()
  task.incidentId = 'INC-TAMPERED'

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: { open: async () => { throw new Error('session must not open') } },
    context: {
      resolveSecretRef: async () => 'unused',
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.match(result.error || '', /incidentId mismatch/)
})

test('browser runtime rejects navigation outside approved origins', async () => {
  const task = makeTask()
  task.steps[0] = { id: 'navigate', kind: 'navigate', url: 'https://evil.example/settings' }
  signTask(task, 'nonce-002')

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: {
      async open() {
        return {
          page: {
            url: () => 'about:blank',
            goto: async () => undefined,
            click: async () => undefined,
            fill: async () => undefined,
            waitForSelector: async () => undefined,
          },
          close: async () => undefined,
        }
      },
    },
    context: {
      resolveSecretRef: async () => 'unused',
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.match(result.error || '', /not approved/)
})

test('browser runtime rejects an approved navigation that redirects to an unapproved origin', async () => {
  const task = makeTask()
  task.steps = [{ id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' }]
  signTask(task, 'nonce-003')
  let currentUrl = 'about:blank'

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async () => { currentUrl = 'https://evil.example/redirected' },
            click: async () => undefined,
            fill: async () => undefined,
            waitForSelector: async () => undefined,
          },
          close: async () => undefined,
        }
      },
    },
    context: {
      resolveSecretRef: async () => 'unused',
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.completedStepIds, [])
  assert.match(result.error || '', /Current page after step navigate origin is not approved/)
})

test('browser runtime blocks a click redirect before resolving or filling a secret', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.steps = [
    { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
    { id: 'leave-origin', kind: 'click', selector: '#external-redirect' },
    { id: 'fill-secret', kind: 'fill', selector: '#value', valueRef: 'vault://test/value' },
  ]
  signTask(task, 'nonce-004')
  let currentUrl = 'about:blank'

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async url => { currentUrl = url; calls.push(`goto:${url}`) },
            click: async selector => { currentUrl = 'https://evil.example/landing'; calls.push(`click:${selector}`) },
            fill: async selector => { calls.push(`fill:${selector}`) },
            waitForSelector: async () => undefined,
          },
          close: async () => { calls.push('close') },
        }
      },
    },
    context: {
      resolveSecretRef: async ref => { calls.push(`secret:${ref}`); return 'must-not-be-used' },
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.completedStepIds, ['navigate'])
  assert.match(result.error || '', /Current page after step leave-origin origin is not approved/)
  assert.equal(calls.some(call => call.startsWith('secret:')), false)
  assert.equal(calls.some(call => call.startsWith('fill:')), false)
  assert.equal(calls.at(-1), 'close')
})

test('browser runtime rechecks the origin after secret resolution and before filling', async () => {
  const calls: string[] = []
  const task = makeTask()
  task.steps = [
    { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
    { id: 'fill-secret', kind: 'fill', selector: '#value', valueRef: 'vault://test/value' },
  ]
  signTask(task, 'nonce-005')
  let currentUrl = 'about:blank'

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async url => { currentUrl = url },
            click: async () => undefined,
            fill: async selector => { calls.push(`fill:${selector}`) },
            waitForSelector: async () => undefined,
          },
          close: async () => undefined,
        }
      },
    },
    context: {
      resolveSecretRef: async ref => {
        calls.push(`secret:${ref}`)
        currentUrl = 'https://evil.example/raced'
        return 'resolved-but-not-filled'
      },
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.deepEqual(result.completedStepIds, ['navigate'])
  assert.match(result.error || '', /Current page before step fill-secret origin is not approved/)
  assert.deepEqual(calls, ['secret:vault://test/value'])
})
