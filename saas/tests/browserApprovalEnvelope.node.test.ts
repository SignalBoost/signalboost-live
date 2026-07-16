import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BROWSER_APPROVAL_MAX_SCOPE_ITEMS,
  BROWSER_APPROVAL_MAX_TOKEN_LENGTH,
  issueBrowserApprovalToken,
  verifyBrowserApprovalToken,
} from '../lib/browser-runtime/approval.ts'
import type { BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const signingSecret = 'browser-approval-envelope-test-secret'
const now = new Date('2026-07-16T12:30:00.000Z')

function makeTask(): BrowserTask {
  return {
    taskId: 'TASK-APPROVAL-ENVELOPE',
    incidentId: 'INC-APPROVAL-ENVELOPE',
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt: '2026-07-16T12:00:00.000Z',
    expiresAt: '2026-07-16T13:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      {
        id: 'observe',
        kind: 'navigate',
        url: 'https://sandbox.example.test/settings',
      },
    ],
    approvalToken: '',
  }
}

function makeClaims(task: BrowserTask): BrowserApprovalClaims {
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
    nonce: 'approval-envelope-nonce',
  }
}

test('approval verification rejects unsupported signed claim fields', () => {
  const task = makeTask()
  const claims = {
    ...makeClaims(task),
    ignoredAuthorization: 'must-not-be-accepted',
  } as BrowserApprovalClaims
  const token = issueBrowserApprovalToken(claims, signingSecret)

  assert.throws(
    () => verifyBrowserApprovalToken(token, task, signingSecret, now),
    /claims contain unsupported fields: ignoredAuthorization/,
  )
})

test('approval verification rejects unbounded signed scope arrays', () => {
  const task = makeTask()
  const claims = makeClaims(task)
  claims.allowedOrigins = Array.from(
    { length: BROWSER_APPROVAL_MAX_SCOPE_ITEMS + 1 },
    (_, index) => `https://sandbox-${index}.example.test`,
  )
  const token = issueBrowserApprovalToken(claims, signingSecret)

  assert.throws(
    () => verifyBrowserApprovalToken(token, task, signingSecret, now),
    /allowedOrigins must contain no more than 128 entries/,
  )
})

test('approval verification rejects oversized tokens before signature work', () => {
  const task = makeTask()

  assert.throws(
    () => verifyBrowserApprovalToken(
      'a'.repeat(BROWSER_APPROVAL_MAX_TOKEN_LENGTH + 1),
      task,
      signingSecret,
      now,
    ),
    /no longer than 262144 characters/,
  )
})

test('approval verification rejects non-canonical token whitespace and segments', () => {
  const task = makeTask()
  const token = issueBrowserApprovalToken(makeClaims(task), signingSecret)
  const [payload, tokenSignature] = token.split('.')

  assert.throws(
    () => verifyBrowserApprovalToken(`${token}\n`, task, signingSecret, now),
    /must be a non-empty canonical string/,
  )
  assert.throws(
    () => verifyBrowserApprovalToken(`${payload}=.${tokenSignature}`, task, signingSecret, now),
    /Malformed browser approval token/,
  )
  assert.throws(
    () => verifyBrowserApprovalToken(`${payload}.${tokenSignature}a`, task, signingSecret, now),
    /Malformed browser approval token/,
  )
})

test('approval issuance refuses an unbounded signed envelope', () => {
  const task = makeTask()
  const claims = {
    ...makeClaims(task),
    oversizedIgnoredField: 'x'.repeat(BROWSER_APPROVAL_MAX_TOKEN_LENGTH),
  } as BrowserApprovalClaims

  assert.throws(
    () => issueBrowserApprovalToken(claims, signingSecret),
    /exceeds 262144 characters/,
  )
})
