// saas/tests/browserExecutionSnapshot.node.test.ts
import { SANDBOX_ADAPTER_ID } from '../lib/browser-runtime/sandbox-adapter.ts'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  digestBrowserApprovalToken,
  issueBrowserApprovalToken,
  type BrowserApprovalClaims,
} from '../lib/browser-runtime/approval.ts'
import type {
  BrowserSessionPort,
  BrowserTask,
} from '../lib/browser-runtime/contracts.ts'
import {
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
  type BrowserExecutionRecord,
  type BrowserExecutionStore,
  type BrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import { resumeBrowserTask, runBrowserTask } from '../lib/browser-runtime/runtime.ts'

const secret = 'immutable-execution-snapshot-secret'
const now = new Date('2026-07-15T10:30:00.000Z')

function issueApproval(
  task: BrowserTask,
  allowedStepIds: string[],
  nonce: string,
  continuation?: {
    phase: 1 | 2
    checkpointStepId: string
    executionId?: string
    preApprovalTokenDigest?: string
  },
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
    phase: continuation?.phase,
    checkpointStepId: continuation?.checkpointStepId,
    executionId: continuation?.executionId,
    preApprovalTokenDigest: continuation?.preApprovalTokenDigest,
  }
  return issueBrowserApprovalToken(claims, secret)
}

function makeSinglePhaseTask(): BrowserTask {
  const task: BrowserTask = {
    taskId: 'TASK-SNAPSHOT-001',
    incidentId: 'INC-SNAPSHOT-001',
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    issuedAt: '2026-07-15T10:00:00.000Z',
    expiresAt: '2026-07-15T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'approved-click', kind: 'click', selector: '#approved-target' },
    ],
    approvalToken: '',
    metadata: {
      launchArgs: ['--must-not-affect-execution'],
    },
  }
  task.approvalToken = issueApproval(
    task,
    task.steps.map(step => step.id),
    'single-phase',
  )
  return task
}

function makeResumableTask(): BrowserTask {
  return {
    taskId: 'TASK-SNAPSHOT-RESUME-001',
    incidentId: 'INC-SNAPSHOT-RESUME-001',
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    issuedAt: '2026-07-15T10:00:00.000Z',
    expiresAt: '2026-07-15T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'before-save', kind: 'screenshot', label: 'before-save' },
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

test('runtime keeps authorizing and executable fields outside the session launch boundary', async () => {
  const task = makeSinglePhaseTask()
  const calls: string[] = []
  let currentUrl = 'about:blank'

  const result = await runBrowserTask({
    task,
    signingSecret: secret,
    now,
    sessions: {
      async open(launchRequest) {
        assert.equal(Object.isFrozen(launchRequest), true)
        assert.equal(Object.isFrozen(launchRequest.allowedOrigins), true)
        assert.deepEqual(Object.keys(launchRequest).sort(), [
          'adapterId',
          'allowedOrigins',
          'mode',
          'provider',
        ])
        assert.equal('taskId' in launchRequest, false)
        assert.equal('incidentId' in launchRequest, false)
        assert.equal('issuedAt' in launchRequest, false)
        assert.equal('expiresAt' in launchRequest, false)
        assert.equal('approvalToken' in launchRequest, false)
        assert.equal('steps' in launchRequest, false)
        assert.equal('metadata' in launchRequest, false)

        task.allowedOrigins.push('https://evil.example')
        task.steps[1] = {
          id: 'approved-click',
          kind: 'click',
          selector: '#tampered-target',
        }

        return {
          page: {
            url: () => currentUrl,
            goto: async url => {
              currentUrl = url
              calls.push(`goto:${url}`)
            },
            click: async selector => {
              calls.push(`click:${selector}`)
            },
            fill: async () => undefined,
            waitForSelector: async () => undefined,
          },
          close: async () => {
            calls.push('close')
          },
        }
      },
    },
    context: {
      resolveSecretRef: async () => 'unused',
      captureScreenshot: async () => 'unused',
    },
  })

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.completedStepIds, ['navigate', 'approved-click'])
  assert.deepEqual(calls, [
    'goto:https://sandbox.example.test/settings',
    'click:#approved-target',
    'close',
  ])
  assert.notEqual(result.verification, 'pending')
  if (result.verification !== 'pending') assert.equal(result.verification.status, 'verified')
})

test('resumed execution detaches approved task and retained record before async ports run', async () => {
  const task = makeResumableTask()
  task.approvalToken = issueApproval(
    task,
    ['navigate', 'before-save', 'approval-checkpoint'],
    'phase-one',
    {
      phase: 1,
      checkpointStepId: 'approval-checkpoint',
    },
  )

  const calls: string[] = []
  let currentUrl = 'about:blank'
  let loadedRecord: BrowserExecutionRecord | null = null
  const backingStore = new InMemoryBrowserExecutionStore()
  const executionStore: BrowserExecutionStore = {
    save: (record, retainedAt) => backingStore.save(record, retainedAt),
    async load(executionId) {
      loadedRecord = await backingStore.load(executionId)
      return loadedRecord
    },
    delete: executionId => backingStore.delete(executionId),
  }
  const backingRegistry = new InMemoryBrowserSessionRegistry()
  const mutatingRegistry: BrowserSessionRegistry = {
    retain: (
      executionId: string,
      session: BrowserSessionPort,
      expiresAt: string,
      retainedAt?: Date,
    ) => backingRegistry.retain(executionId, session, expiresAt, retainedAt),
    async take(executionId: string) {
      task.allowedOrigins.push('https://evil.example')
      if (loadedRecord) {
        loadedRecord.allowedOrigins.push('https://evil.example')
        loadedRecord.remainingSteps[0] = {
          id: 'protected-save',
          kind: 'click',
          selector: '#tampered-save',
        }
      }
      return backingRegistry.take(executionId)
    },
    discard: executionId => backingRegistry.discard(executionId),
  }

  const sessions = {
    async open() {
      return {
        page: {
          url: () => currentUrl,
          goto: async (url: string) => {
            currentUrl = url
            calls.push(`goto:${url}`)
          },
          click: async (selector: string) => {
            currentUrl = 'https://evil.example/redirected'
            calls.push(`click:${selector}`)
          },
          fill: async () => undefined,
          waitForSelector: async (selector: string) => {
            calls.push(`wait:${selector}`)
          },
        },
        close: async () => {
          calls.push('close')
        },
      }
    },
  }
  const context = {
    resolveSecretRef: async () => 'unused',
    captureScreenshot: async (label: string) => {
      calls.push(`screenshot:${label}`)
      return `artifact://${label}`
    },
  }

  const paused = await runBrowserTask({
    task,
    signingSecret: secret,
    sessions,
    context,
    executionStore,
    sessionRegistry: mutatingRegistry,
    now,
  })

  assert.equal(paused.status, 'paused')
  assert.ok(paused.executionId)

  const secondApprovalToken = issueApproval(
    task,
    ['protected-save', 'wait-success', 'after-save'],
    'phase-two',
    {
      phase: 2,
      checkpointStepId: 'approval-checkpoint',
      executionId: paused.executionId,
      preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
    },
  )

  const resumed = await resumeBrowserTask({
    task,
    executionId: paused.executionId!,
    secondApprovalToken,
    signingSecret: secret,
    executionStore,
    sessionRegistry: mutatingRegistry,
    context,
    now,
  })

  assert.equal(resumed.status, 'failed')
  assert.match(resumed.error || '', /Current page after step protected-save origin is not approved/)
  assert.equal(task.allowedOrigins.includes('https://evil.example'), true)
  assert.equal(loadedRecord?.allowedOrigins.includes('https://evil.example'), true)
  assert.equal(calls.includes('click:#protected-save'), true)
  assert.equal(calls.includes('click:#tampered-save'), false)
  assert.equal(calls.includes('wait:#save-success'), false)
  assert.equal(calls.includes('screenshot:after-save'), false)
  assert.equal(await backingStore.load(paused.executionId!), null)
})
