// saas/tests/browserExecutionIdentity.node.test.ts
import { SANDBOX_ADAPTER_ID } from '../lib/browser-runtime/sandbox-adapter.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  digestBrowserApprovalToken,
  issueBrowserApprovalToken,
  type BrowserApprovalClaims,
} from '../lib/browser-runtime/approval.ts'
import type { BrowserTask, BrowserTaskResult } from '../lib/browser-runtime/contracts.ts'
import {
  createBrowserExecutionId,
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { resumeBrowserTask, runBrowserTask } from '../lib/browser-runtime/runtime.ts'
import {
  verifyBrowserTaskResult,
  verifyResumedBrowserTaskResult,
} from '../lib/browser-runtime/verification.ts'

const signingSecret = 'execution-identity-test-secret'
const now = new Date('2026-07-16T10:30:00.000Z')
const checkpointStepId = 'approval-checkpoint'

function makeTask(): BrowserTask {
  return {
    taskId: 'TASK-EXECUTION-IDENTITY-001',
    incidentId: 'INC-EXECUTION-IDENTITY-001',
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    issuedAt: '2026-07-16T10:00:00.000Z',
    expiresAt: '2026-07-16T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      {
        id: checkpointStepId,
        kind: 'checkpoint',
        label: 'Owner approval required',
        requiresApproval: true,
      },
      { id: 'protected-save', kind: 'click', selector: '#protected-save' },
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
    allowedStepIds: ['navigate', checkpointStepId],
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: 'execution-identity-phase-1',
    phase: 1,
    checkpointStepId,
  }
  return issueBrowserApprovalToken(claims, signingSecret)
}

function signPhaseTwo(task: BrowserTask, executionId: string): string {
  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: ['protected-save'],
    allowedOrigins: task.allowedOrigins,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: 'execution-identity-phase-2',
    phase: 2,
    checkpointStepId,
    executionId,
    preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
  }
  return issueBrowserApprovalToken(claims, signingSecret)
}

function ports() {
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
      resolveSecretRef: async () => 'unused',
      captureScreenshot: async (label: string) => `artifact://${label}`,
    },
    wasClosed: () => closed,
  }
}

function requireVerification(result: BrowserTaskResult) {
  assert.notEqual(result.verification, 'pending')
  if (result.verification === 'pending') throw new Error('Expected terminal verification report')
  return result.verification
}

test('verification binds paused and resumed results to the exact continuation execution ID', async () => {
  const task = makeTask()
  task.approvalToken = signPhaseOne(task)
  const executionId = createBrowserExecutionId(task, checkpointStepId)
  const executionStore = new InMemoryBrowserExecutionStore()
  const sessionRegistry = new InMemoryBrowserSessionRegistry()
  const runtimePorts = ports()

  const paused = await runBrowserTask({
    task,
    signingSecret,
    sessions: runtimePorts.sessions,
    context: runtimePorts.context,
    executionStore,
    sessionRegistry,
    now,
  })

  assert.equal(paused.status, 'paused')
  assert.equal(paused.executionId, executionId)
  assert.equal(runtimePorts.wasClosed(), false)
  const pausedVerification = requireVerification(paused)
  assert.equal(pausedVerification.status, 'verified')
  assert.ok(
    pausedVerification.checks.some(check => check.id === 'execution-id' && check.passed),
  )

  const defaultPausedReport = verifyBrowserTaskResult(task, paused, now)
  assert.equal(defaultPausedReport.status, 'verified')

  const missingPaused = structuredClone(paused)
  delete missingPaused.executionId
  const missingPausedReport = verifyBrowserTaskResult(task, missingPaused, now, executionId)
  assert.equal(missingPausedReport.status, 'failed')
  assert.ok(
    missingPausedReport.checks.some(check => check.id === 'execution-id' && !check.passed),
  )

  const missingPausedDefaultReport = verifyBrowserTaskResult(task, missingPaused, now)
  assert.equal(missingPausedDefaultReport.status, 'failed')
  assert.ok(
    missingPausedDefaultReport.checks.some(check => check.id === 'execution-id' && !check.passed),
  )

  const tamperedPaused = structuredClone(paused)
  tamperedPaused.executionId = '0'.repeat(64)
  const tamperedPausedReport = verifyBrowserTaskResult(task, tamperedPaused, now, executionId)
  assert.equal(tamperedPausedReport.status, 'failed')
  assert.ok(
    tamperedPausedReport.checks.some(check => check.id === 'execution-id' && !check.passed),
  )

  const completed = await resumeBrowserTask({
    task,
    executionId,
    secondApprovalToken: signPhaseTwo(task, executionId),
    signingSecret,
    executionStore,
    sessionRegistry,
    context: runtimePorts.context,
    now,
  })

  assert.equal(completed.status, 'completed')
  assert.equal(completed.executionId, executionId)
  assert.equal(runtimePorts.wasClosed(), true)
  const completedVerification = requireVerification(completed)
  assert.equal(completedVerification.status, 'verified')
  assert.ok(
    completedVerification.checks.some(check => check.id === 'execution-id' && check.passed),
  )

  const tamperedCompleted = structuredClone(completed)
  tamperedCompleted.executionId = 'f'.repeat(64)
  const tamperedCompletedReport = verifyResumedBrowserTaskResult(
    task,
    tamperedCompleted,
    checkpointStepId,
    now,
  )
  assert.equal(tamperedCompletedReport.status, 'failed')
  assert.ok(
    tamperedCompletedReport.checks.some(check => check.id === 'execution-id' && !check.passed),
  )

  await sessionRegistry.shutdown()
  await executionStore.shutdown()
})
