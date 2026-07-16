import test from 'node:test'
import assert from 'node:assert/strict'

import {
  issueBrowserApprovalToken,
  verifyBrowserApprovalToken,
} from '../lib/browser-runtime/approval.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const secret = 'browser-approval-test-secret'
const now = new Date('2026-07-16T05:30:00.000Z')

function makeTask(overrides: Partial<BrowserTask> = {}): BrowserTask {
  return {
    taskId: 'TASK-APPROVAL-TIME',
    incidentId: 'INC-APPROVAL-TIME',
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-16T05:00:00.000Z',
    expiresAt: '2026-07-16T06:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      {
        id: 'observe',
        kind: 'navigate',
        url: 'https://sandbox.example.test/settings',
      },
    ],
    approvalToken: '',
    ...overrides,
  }
}

function makeClaims(
  task: BrowserTask,
  overrides: Partial<BrowserApprovalClaims> = {},
): BrowserApprovalClaims {
  return {
    version: 1,
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    allowedStepIds: task.steps.map(step => step.id),
    allowedOrigins: [...task.allowedOrigins],
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    nonce: 'approval-time-nonce',
    ...overrides,
  }
}

function verify(task: BrowserTask, claims: BrowserApprovalClaims): BrowserApprovalClaims {
  const token = issueBrowserApprovalToken(claims, secret)
  return verifyBrowserApprovalToken(token, task, secret, now)
}

test('approval verification accepts an exact valid task time window', () => {
  const task = makeTask()
  const claims = makeClaims(task)

  assert.deepEqual(verify(task, claims), claims)
})

test('approval verification binds issuedAt to the exact approved task', () => {
  const task = makeTask()
  const claims = makeClaims(task, { issuedAt: '2026-07-16T05:00:01.000Z' })

  assert.throws(() => verify(task, claims), /issuedAt mismatch/)
})

test('approval verification rejects malformed issuedAt timestamps', () => {
  const task = makeTask({ issuedAt: 'not-a-timestamp' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /issuedAt must be a canonical UTC ISO timestamp/)
})

test('approval verification rejects malformed expiresAt timestamps', () => {
  const task = makeTask({ expiresAt: 'not-a-timestamp' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /expiresAt must be a canonical UTC ISO timestamp/)
})

test('approval verification rejects impossible calendar dates that Date.parse normalizes', () => {
  const task = makeTask({ issuedAt: '2026-02-30T00:00:00.000Z' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /issuedAt must be a canonical UTC ISO timestamp/)
})

test('approval verification rejects parseable shorthand timestamps', () => {
  const task = makeTask({ issuedAt: '0' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /issuedAt must be a canonical UTC ISO timestamp/)
})

test('approval verification rejects non-canonical ISO offsets', () => {
  const task = makeTask({ issuedAt: '2026-07-16T05:00:00+00:00' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /issuedAt must be a canonical UTC ISO timestamp/)
})

test('approval verification rejects non-positive approval windows', () => {
  const task = makeTask({ expiresAt: '2026-07-16T05:00:00.000Z' })
  const claims = makeClaims(task)

  assert.throws(() => verify(task, claims), /expiry must be after issuedAt/)
})

test('approval verification rejects an invalid verification clock', () => {
  const task = makeTask()
  const claims = makeClaims(task)
  const token = issueBrowserApprovalToken(claims, secret)

  assert.throws(
    () => verifyBrowserApprovalToken(token, task, secret, new Date('invalid')),
    /verification time must be valid/,
  )
})

test('approval verification rejects non-object signed claims deterministically', () => {
  const task = makeTask()
  const token = issueBrowserApprovalToken(null as unknown as BrowserApprovalClaims, secret)

  assert.throws(
    () => verifyBrowserApprovalToken(token, task, secret, now),
    /Malformed browser approval token claims/,
  )
})

test('approval verification requires a bounded non-empty nonce', () => {
  const task = makeTask()

  assert.throws(
    () => verify(task, makeClaims(task, { nonce: '   ' })),
    /nonce must be a non-empty canonical string/,
  )
  assert.throws(
    () => verify(task, makeClaims(task, { nonce: 'n'.repeat(257) })),
    /nonce must be a non-empty canonical string/,
  )
})

test('approval verification rejects duplicate or empty task step IDs', () => {
  const duplicateTask = makeTask({
    steps: [
      { id: 'duplicate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'duplicate', kind: 'screenshot', label: 'duplicate step' },
    ],
  })
  assert.throws(
    () => verify(duplicateTask, makeClaims(duplicateTask)),
    /Browser task step IDs must be a non-empty array of unique non-empty strings/,
  )

  const emptyTask = makeTask({
    steps: [{ id: '', kind: 'navigate', url: 'https://sandbox.example.test/settings' }],
  })
  assert.throws(
    () => verify(emptyTask, makeClaims(emptyTask)),
    /Browser task step IDs entry must be a non-empty canonical string/,
  )
})

test('approval verification requires canonical origin-only scope', () => {
  const pathScopedTask = makeTask({
    allowedOrigins: ['https://sandbox.example.test/settings'],
  })
  assert.throws(
    () => verify(pathScopedTask, makeClaims(pathScopedTask)),
    /Browser task allowedOrigins must contain only canonical HTTP\(S\) origins/,
  )

  const credentialScopedTask = makeTask({
    allowedOrigins: ['https://user:password@sandbox.example.test'],
  })
  assert.throws(
    () => verify(credentialScopedTask, makeClaims(credentialScopedTask)),
    /Browser task allowedOrigins must contain only canonical HTTP\(S\) origins/,
  )
})

test('approval verification rejects duplicate approved origins', () => {
  const task = makeTask({
    allowedOrigins: [
      'https://sandbox.example.test',
      'https://sandbox.example.test',
    ],
  })

  assert.throws(
    () => verify(task, makeClaims(task)),
    /Browser task allowedOrigins must be a non-empty array of unique non-empty strings/,
  )
})

test('approval verification rejects ambiguous continuation claim shapes', () => {
  const task = makeTask({
    steps: [
      { id: 'observe', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      {
        id: 'approval-checkpoint',
        kind: 'checkpoint',
        label: 'Owner approval required',
        requiresApproval: true,
      },
      { id: 'protected-save', kind: 'click', selector: '#protected-save' },
    ],
  })

  assert.throws(
    () => verify(task, makeClaims(task, {
      phase: 1,
      checkpointStepId: 'approval-checkpoint',
      executionId: 'a'.repeat(64),
      preApprovalTokenDigest: 'b'.repeat(64),
    })),
    /phase 1 must not include execution binding claims/,
  )

  assert.throws(
    () => verify(task, makeClaims(task, {
      phase: 2,
      checkpointStepId: 'approval-checkpoint',
    })),
    /executionId must be a non-empty canonical string/,
  )

  assert.throws(
    () => verify(task, makeClaims(task, {
      checkpointStepId: 'approval-checkpoint',
    })),
    /continuation claims require an explicit phase/,
  )
})
