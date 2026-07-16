import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  BROWSER_APPROVAL_MAX_LIFETIME_MS,
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

function signRawClaimsJson(json: string): string {
  const payload = Buffer.from(json, 'utf8').toString('base64url')
  const tokenSignature = createHmac('sha256', signingSecret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${tokenSignature}`
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

test('approval issuance canonicalizes claim order deterministically', () => {
  const task = makeTask()
  const claims = makeClaims(task)
  const reordered: BrowserApprovalClaims = {
    nonce: claims.nonce,
    expiresAt: claims.expiresAt,
    issuedAt: claims.issuedAt,
    allowedOrigins: claims.allowedOrigins,
    allowedStepIds: claims.allowedStepIds,
    mode: claims.mode,
    adapterId: claims.adapterId,
    provider: claims.provider,
    incidentId: claims.incidentId,
    taskId: claims.taskId,
    version: claims.version,
  }

  assert.equal(
    issueBrowserApprovalToken(reordered, signingSecret),
    issueBrowserApprovalToken(claims, signingSecret),
  )
})

test('approval verification rejects valid signatures over non-canonical claim JSON', () => {
  const task = makeTask()
  const claims = makeClaims(task)
  const prettyPrintedToken = signRawClaimsJson(JSON.stringify(claims, null, 2))

  assert.throws(
    () => verifyBrowserApprovalToken(prettyPrintedToken, task, signingSecret, now),
    /claims must use canonical JSON encoding/,
  )

  const canonicalToken = issueBrowserApprovalToken(claims, signingSecret)
  const [canonicalPayload] = canonicalToken.split('.')
  const canonicalJson = Buffer.from(canonicalPayload, 'base64url').toString('utf8')
  const duplicateTaskIdJson = canonicalJson.replace(
    `"taskId":"${task.taskId}"`,
    `"taskId":"${task.taskId}","taskId":"${task.taskId}"`,
  )

  assert.throws(
    () => verifyBrowserApprovalToken(
      signRawClaimsJson(duplicateTaskIdJson),
      task,
      signingSecret,
      now,
    ),
    /claims must use canonical JSON encoding/,
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

test('approval verification accepts the exact maximum approval lifetime', () => {
  const task = makeTask()
  assert.equal(
    Date.parse(task.expiresAt) - Date.parse(task.issuedAt),
    BROWSER_APPROVAL_MAX_LIFETIME_MS,
  )
  const token = issueBrowserApprovalToken(makeClaims(task), signingSecret)

  assert.doesNotThrow(() => verifyBrowserApprovalToken(token, task, signingSecret, now))
})

test('approval verification rejects approval lifetimes above the maximum', () => {
  const task = makeTask()
  task.expiresAt = new Date(
    Date.parse(task.issuedAt) + BROWSER_APPROVAL_MAX_LIFETIME_MS + 1,
  ).toISOString()
  const token = issueBrowserApprovalToken(makeClaims(task), signingSecret)

  assert.throws(
    () => verifyBrowserApprovalToken(token, task, signingSecret, now),
    /lifetime must not exceed 3600000ms/,
  )
})
