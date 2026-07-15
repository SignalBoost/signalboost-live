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

function makeResumableSandboxTasks() {
  const issuedAt = '2026-07-15T10:00:00.000Z'
  const expiresAt = '2026-07-15T11:00:00.000Z'
  const baseTask: BrowserTask = {
    taskId: 'TASK-RESUME-001',
    incidentId: 'INC-RESUME-001',
    provider: 'sandbox',
    adapterId: 'sandbox.v1',
    mode: 'prepare_change',
    issuedAt,
    expiresAt,
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'fill-value', kind: 'fill', selector: '#value', valueRef: 'vault://approved/value' },
      { id: 'capture-ready', kind: 'screenshot', label: 'ready' },
      { id: 'approval-checkpoint', kind: 'checkpoint', label: 'Owner approval required', requiresApproval: true },
      { id: 'protected-save', kind: 'click', selector: '[data-action="protected-save"]' },
      { id: 'wait-save-success', kind: 'wait_for', selector: '[data-browser-sandbox="save-success"]' },
      { id: 'capture-final', kind: 'screenshot', label: 'final' },
    ],
    approvalToken: '',
  }
  signTask(baseTask, 'resume-phase-1')
  const remainingTask: BrowserTask = { ...baseTask, steps: baseTask.steps.slice(4), approvalToken: '' }
  signTask(remainingTask, 'resume-phase-2')
  return { baseTask, remainingTask }
}

test('resumable browser runtime does not protected-save before second approval and completes after resume', async () => {
  const { InMemoryBrowserExecutionStore } = await import('../lib/browser-runtime/execution-state.ts')
  const { resumeBrowserTask } = await import('../lib/browser-runtime/runtime.ts')
  const store = new InMemoryBrowserExecutionStore()
  const { baseTask, remainingTask } = makeResumableSandboxTasks()
  const calls: string[] = []
  let currentUrl = 'about:blank'
  let saved = 'unchanged'
  let draft = 'unchanged'

  const session = {
    page: {
      url: () => currentUrl,
      goto: async (url: string) => { currentUrl = url; calls.push(`goto:${url}`) },
      click: async (selector: string) => { calls.push(`click:${selector}`); saved = draft },
      fill: async (selector: string, value: string) => { calls.push(`fill:${selector}`); draft = value },
      waitForSelector: async (selector: string) => { calls.push(`wait:${selector}`); assert.equal(saved, 'browser-runtime-test-001') },
      textContent: async () => `Saved value: ${saved}`,
    },
    close: async () => { calls.push('close') },
  }

  const phase1 = await runBrowserTask({
    task: baseTask,
    signingSecret: secret,
    now: new Date('2026-07-15T10:30:00.000Z'),
    executionStore: store,
    sessions: { open: async () => session },
    context: { resolveSecretRef: async () => 'browser-runtime-test-001', captureScreenshot: async label => `artifact://${label}` },
  })

  assert.equal(phase1.status, 'paused')
  assert.equal(calls.includes('click:[data-action="protected-save"]'), false)
  assert.equal(saved, 'unchanged')

  const phase2 = await resumeBrowserTask({
    task: remainingTask,
    executionId: phase1.executionId || '',
    secondApprovalToken: remainingTask.approvalToken,
    signingSecret: secret,
    executionStore: store,
    context: { resolveSecretRef: async () => 'unused', captureScreenshot: async label => `artifact://${label}` },
    approvedValue: 'browser-runtime-test-001',
    successSelector: '[data-browser-sandbox="save-success"]',
    savedValueSelector: '[data-sandbox-saved-value]',
    now: new Date('2026-07-15T10:30:00.000Z'),
  })

  assert.equal(phase2.status, 'completed')
  assert.equal(saved, 'browser-runtime-test-001')
  assert.equal(phase2.verification !== 'pending' && phase2.verification.ok, true)
  assert.equal(Boolean(phase2.evidencePackage?.evidenceHash), true)
})

test('resumable browser runtime rejects an expired second approval', async () => {
  const { InMemoryBrowserExecutionStore } = await import('../lib/browser-runtime/execution-state.ts')
  const { resumeBrowserTask } = await import('../lib/browser-runtime/runtime.ts')
  const store = new InMemoryBrowserExecutionStore()
  const { baseTask, remainingTask } = makeResumableSandboxTasks()
  const phase1 = await runBrowserTask({ task: baseTask, signingSecret: secret, now: new Date('2026-07-15T10:30:00.000Z'), executionStore: store, sessions: { open: async () => ({ page: { url: () => 'https://sandbox.example.test/settings', goto: async () => {}, click: async () => {}, fill: async () => {}, waitForSelector: async () => {}, textContent: async () => 'Saved value: unchanged' }, close: async () => {} }) }, context: { resolveSecretRef: async () => 'browser-runtime-test-001', captureScreenshot: async () => 'artifact://ready' } })
  const result = await resumeBrowserTask({ task: remainingTask, executionId: phase1.executionId || '', secondApprovalToken: remainingTask.approvalToken, signingSecret: secret, executionStore: store, context: { resolveSecretRef: async () => 'unused', captureScreenshot: async () => 'unused' }, approvedValue: 'browser-runtime-test-001', successSelector: '[data-browser-sandbox="save-success"]', savedValueSelector: '[data-sandbox-saved-value]', now: new Date('2026-07-15T11:01:00.000Z') })
  assert.equal(result.status, 'failed')
  assert.match(result.error || '', /expired/)
})

test('resumable browser runtime rejects tampered task, mismatched incident, mismatched remaining steps, missing secret refs, crashed sessions, redirect escapes, and verification failures', async () => {
  const { InMemoryBrowserExecutionStore } = await import('../lib/browser-runtime/execution-state.ts')
  const { resumeBrowserTask } = await import('../lib/browser-runtime/runtime.ts')
  const cases = ['tampered-task', 'incident', 'steps', 'secret', 'crash', 'redirect', 'verify']
  for (const scenario of cases) {
    const store = new InMemoryBrowserExecutionStore()
    const { baseTask, remainingTask } = makeResumableSandboxTasks()
    let currentUrl = 'https://sandbox.example.test/settings'
    let saved = scenario === 'verify' ? 'wrong-value' : 'browser-runtime-test-001'
    const session = { page: { url: () => currentUrl, goto: async () => {}, click: async () => { if (scenario === 'redirect') currentUrl = 'https://evil.example/out' }, fill: async () => {}, waitForSelector: async () => {}, textContent: async () => `Saved value: ${saved}` }, close: async () => {} }
    const phase1 = await runBrowserTask({ task: baseTask, signingSecret: secret, now: new Date('2026-07-15T10:30:00.000Z'), executionStore: store, sessions: { open: async () => session }, context: { resolveSecretRef: async () => 'browser-runtime-test-001', captureScreenshot: async label => `artifact://${label}` } })
    const record = await store.load(phase1.executionId || '')
    assert.ok(record)
    let task = remainingTask
    if (scenario === 'tampered-task') task = { ...remainingTask, taskId: 'TASK-TAMPERED' }
    if (scenario === 'incident') task = { ...remainingTask, incidentId: 'INC-TAMPERED' }
    if (scenario === 'steps') task = { ...remainingTask, steps: remainingTask.steps.slice(1) }
    if (scenario === 'secret') { record.remainingSteps = [{ id: 'bad-fill', kind: 'fill', selector: '#value', valueRef: '' }] }
    if (scenario === 'crash') record.session = undefined
    await store.save(record)
    const result = await resumeBrowserTask({ task, executionId: phase1.executionId || '', secondApprovalToken: remainingTask.approvalToken, signingSecret: secret, executionStore: store, context: { resolveSecretRef: async () => 'unused', captureScreenshot: async label => `artifact://${label}` }, approvedValue: 'browser-runtime-test-001', successSelector: '[data-browser-sandbox="save-success"]', savedValueSelector: '[data-sandbox-saved-value]', now: new Date('2026-07-15T10:30:00.000Z') })
    assert.equal(result.status, 'failed', scenario)
  }
})
