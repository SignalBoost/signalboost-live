import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSandboxBrowserTask,
  buildSandboxProtectedSaveTask,
} from '../lib/browser-runtime/sandbox-adapter.ts'
import { issueBrowserApprovalToken } from '../lib/browser-runtime/approval.ts'
import { runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type {
  BrowserEvidence,
  BrowserTask,
  BrowserTaskResult,
  BrowserTaskStep,
} from '../lib/browser-runtime/contracts.ts'
import { verifyBrowserTaskResult } from '../lib/browser-runtime/verification.ts'

const base = {
  taskId: 'task-sandbox-prepare-1',
  incidentId: 'incident-sandbox-1',
  baseUrl: 'http://localhost:4173',
  issuedAt: '2026-07-15T19:00:00.000Z',
  expiresAt: '2026-07-15T20:00:00.000Z',
  approvalToken: 'signed-token',
}

const signingSecret = 'browser-verification-integration-secret'

function kindForStep(step: BrowserTaskStep): BrowserEvidence['kind'] {
  if (step.kind === 'navigate') return 'navigation'
  if (step.kind === 'screenshot') return 'screenshot'
  if (step.kind === 'checkpoint') return 'checkpoint'
  return 'interaction'
}

function resultForTask(task: BrowserTask): BrowserTaskResult {
  const checkpointIndex = task.steps.findIndex(step => step.kind === 'checkpoint')
  const evidenceSteps = checkpointIndex >= 0
    ? task.steps.slice(0, checkpointIndex + 1)
    : task.steps
  const completedSteps = checkpointIndex >= 0
    ? task.steps.slice(0, checkpointIndex)
    : task.steps

  const evidence = evidenceSteps.map((step, index): BrowserEvidence => ({
    sequence: index + 1,
    timestamp: `2026-07-15T19:00:${String(index).padStart(2, '0')}.000Z`,
    stepId: step.id,
    kind: kindForStep(step),
    summary: step.kind === 'screenshot' || step.kind === 'checkpoint'
      ? step.label
      : `Completed ${step.id}`,
    artifactRef: step.kind === 'screenshot' ? `artifact://${step.id}` : undefined,
    url: step.kind === 'checkpoint'
      ? undefined
      : 'http://localhost:4173/browser-sandbox/login',
  }))

  return {
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    status: checkpointIndex >= 0 ? 'paused' : 'completed',
    startedAt: '2026-07-15T19:00:00.000Z',
    finishedAt: '2026-07-15T19:01:00.000Z',
    completedStepIds: completedSteps.map(step => step.id),
    pausedAtStepId: checkpointIndex >= 0 ? task.steps[checkpointIndex]?.id : undefined,
    evidence,
    verification: 'pending',
  }
}

function signExecutableTask(task: BrowserTask, nonce: string): BrowserTask {
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

  task.approvalToken = issueBrowserApprovalToken(claims, signingSecret)
  return task
}

function executablePorts() {
  let currentUrl = 'about:blank'
  let closed = false

  return {
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async (url: string) => { currentUrl = url },
            click: async () => undefined,
            fill: async () => undefined,
            waitForSelector: async () => undefined,
          },
          close: async () => { closed = true },
        }
      },
    },
    context: {
      resolveSecretRef: async (valueRef: string) => `resolved:${valueRef}`,
      captureScreenshot: async (label: string) => `artifact://${label}`,
    },
    wasClosed: () => closed,
  }
}

test('verifies the separately approved sandbox save evidence package', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-1',
    approvalToken: 'second-signed-token',
  })
  const result = resultForTask(task)

  const report = verifyBrowserTaskResult(
    task,
    result,
    new Date('2026-07-15T19:02:00.000Z'),
  )

  assert.equal(report.status, 'verified')
  assert.equal(report.verifiedAt, '2026-07-15T19:02:00.000Z')
  assert.deepEqual(report.errors, [])
})

test('verifies a preparation result that pauses exactly at the approval checkpoint', () => {
  const task = buildSandboxBrowserTask(base)
  const result = resultForTask(task)

  const report = verifyBrowserTaskResult(task, result)

  assert.equal(report.status, 'verified')
  assert.equal(result.status, 'paused')
  assert.equal(result.pausedAtStepId, 'approval-checkpoint')
})

test('fails verification when a required screenshot artifact is missing', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-2',
  })
  const result = resultForTask(task)
  const finalScreenshot = result.evidence.find(event => event.stepId === 'capture-after-save')
  if (finalScreenshot) finalScreenshot.artifactRef = ''

  const report = verifyBrowserTaskResult(task, result)

  assert.equal(report.status, 'failed')
  assert.ok(report.checks.some(item => item.id === 'screenshot-artifact:capture-after-save' && !item.passed))
})

test('fails verification when evidence escapes the approved origin', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-3',
  })
  const result = resultForTask(task)
  const saveEvidence = result.evidence.find(event => event.stepId === 'protected-save')
  if (saveEvidence) saveEvidence.url = 'https://unapproved.example/save'

  const report = verifyBrowserTaskResult(task, result)

  assert.equal(report.status, 'failed')
  assert.ok(report.checks.some(item => item.id === 'evidence-origin:protected-save' && !item.passed))
})

test('fails verification when task identity or completed-step order is tampered', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-4',
  })
  const result = resultForTask(task)
  result.incidentId = 'incident-tampered'
  result.completedStepIds = [...result.completedStepIds].reverse()

  const report = verifyBrowserTaskResult(task, result)

  assert.equal(report.status, 'failed')
  assert.ok(report.checks.some(item => item.id === 'incident-id' && !item.passed))
  assert.ok(report.checks.some(item => item.id === 'completed-steps' && !item.passed))
})

test('verification fails closed on an invalid clock without throwing', () => {
  const task = buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-invalid-verification-clock',
  })
  const result = resultForTask(task)

  const report = verifyBrowserTaskResult(task, result, new Date(Number.NaN))

  assert.equal(report.status, 'failed')
  assert.equal(report.verifiedAt, '1970-01-01T00:00:00.000Z')
  assert.ok(report.checks.some(item => item.id === 'verification-clock' && !item.passed))
  assert.ok(report.errors.includes('Verification clock is a valid timestamp.'))
})

test('runtime returns a verified report when phase one pauses at its approval checkpoint', async () => {
  const task = signExecutableTask(buildSandboxBrowserTask({
    ...base,
    approvalToken: '',
  }), 'runtime-prepare')
  const ports = executablePorts()

  const result = await runBrowserTask({
    task,
    signingSecret,
    now: new Date('2026-07-15T19:30:00.000Z'),
    sessions: ports.sessions,
    context: ports.context,
  })

  assert.equal(result.status, 'paused')
  assert.notEqual(result.verification, 'pending')
  if (result.verification !== 'pending') {
    assert.equal(result.verification.status, 'verified')
    assert.deepEqual(result.verification.errors, [])
  }
  assert.equal(ports.wasClosed(), true)
})

test('runtime returns a verified report for the separately approved protected-save task', async () => {
  const task = signExecutableTask(buildSandboxProtectedSaveTask({
    ...base,
    taskId: 'task-sandbox-save-runtime',
    approvalToken: '',
  }), 'runtime-save')
  const ports = executablePorts()

  const result = await runBrowserTask({
    task,
    signingSecret,
    now: new Date('2026-07-15T19:30:00.000Z'),
    sessions: ports.sessions,
    context: ports.context,
  })

  assert.equal(result.status, 'completed')
  assert.notEqual(result.verification, 'pending')
  if (result.verification !== 'pending') {
    assert.equal(result.verification.status, 'verified')
    assert.deepEqual(result.verification.errors, [])
  }
  assert.equal(ports.wasClosed(), true)
})

test('runtime returns a failed verification report when approval validation fails', async () => {
  const task = signExecutableTask(buildSandboxBrowserTask({
    ...base,
    approvalToken: '',
  }), 'runtime-invalid')
  task.incidentId = 'incident-tampered-after-signing'
  const ports = executablePorts()

  const result = await runBrowserTask({
    task,
    signingSecret,
    now: new Date('2026-07-15T19:30:00.000Z'),
    sessions: ports.sessions,
    context: ports.context,
  })

  assert.equal(result.status, 'failed')
  assert.notEqual(result.verification, 'pending')
  if (result.verification !== 'pending') {
    assert.equal(result.verification.status, 'failed')
    assert.ok(result.verification.errors.length > 0)
  }
  assert.equal(ports.wasClosed(), false)
})

test('runtime returns a terminal failed report when the verification clock is invalid', async () => {
  const task = signExecutableTask(buildSandboxBrowserTask({
    ...base,
    taskId: 'task-sandbox-runtime-invalid-clock',
    approvalToken: '',
  }), 'runtime-invalid-clock')
  const ports = executablePorts()

  const result = await runBrowserTask({
    task,
    signingSecret,
    now: new Date(Number.NaN),
    sessions: ports.sessions,
    context: ports.context,
  })

  assert.equal(result.status, 'failed')
  assert.match(result.error || '', /verification time must be valid/)
  assert.notEqual(result.verification, 'pending')
  if (result.verification !== 'pending') {
    assert.equal(result.verification.status, 'failed')
    assert.equal(result.verification.verifiedAt, '1970-01-01T00:00:00.000Z')
    assert.ok(
      result.verification.checks.some(
        item => item.id === 'verification-clock' && !item.passed,
      ),
    )
  }
  assert.equal(ports.wasClosed(), false)
})
