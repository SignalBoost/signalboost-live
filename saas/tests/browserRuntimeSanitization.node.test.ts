// saas/tests/browserRuntimeSanitization.node.test.ts
import { SANDBOX_ADAPTER_ID } from '../lib/browser-runtime/sandbox-adapter.ts'
import test from 'node:test'
import assert from 'node:assert/strict'

import { issueBrowserApprovalToken, type BrowserApprovalClaims } from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'
import {
  BROWSER_RUNTIME_MAX_ERROR_LENGTH,
  BROWSER_RUNTIME_REDACTED,
  sanitizeBrowserRuntimeError,
} from '../lib/browser-runtime/error-sanitizer.ts'
import { runBrowserTask } from '../lib/browser-runtime/runtime.ts'

const signingSecret = 'runtime-signing-secret-should-never-leak'
const now = new Date('2026-07-16T10:30:00.000Z')

function makeTask(): BrowserTask {
  const task: BrowserTask = {
    taskId: 'TASK-SANITIZE-001',
    incidentId: 'INC-SANITIZE-001',
    provider: 'sandbox',
    adapterId: SANDBOX_ADAPTER_ID,
    mode: 'prepare_change',
    issuedAt: '2026-07-16T10:00:00.000Z',
    expiresAt: '2026-07-16T11:00:00.000Z',
    allowedOrigins: ['https://sandbox.example.test'],
    steps: [
      { id: 'navigate', kind: 'navigate', url: 'https://sandbox.example.test/settings' },
      { id: 'fill', kind: 'fill', selector: '#value', valueRef: 'sandbox://credentials/value' },
    ],
    approvalToken: '',
  }

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
    nonce: 'sanitize-runtime-failure',
  }
  task.approvalToken = issueBrowserApprovalToken(claims, signingSecret)
  return task
}

test('runtime redacts resolved values, approval material, credentials, and stack frames from failures', async () => {
  const task = makeTask()
  const resolvedValue = 'resolved-browser-secret-value'
  let currentUrl = 'about:blank'

  const result = await runBrowserTask({
    task,
    signingSecret,
    now,
    sessions: {
      async open() {
        return {
          page: {
            url: () => currentUrl,
            goto: async url => { currentUrl = url },
            click: async () => undefined,
            fill: async () => {
              throw new Error(
                `Fill failed value=${resolvedValue} signing=${signingSecret} approval=${task.approvalToken} `
                + 'Authorization: Bearer live-provider-token password=plain-password '
                + 'https://user:pass@example.test/path?access_token=query-token\n'
                + '    at BrowserPage.fill (/workspace/runtime.ts:10:2)',
              )
            },
            waitForSelector: async () => undefined,
          },
          close: async () => undefined,
        }
      },
    },
    context: {
      resolveSecretRef: async () => resolvedValue,
      captureScreenshot: async () => 'artifact://unused',
    },
  })

  assert.equal(result.status, 'failed')
  assert.ok(result.error)
  assert.equal(result.error.includes(resolvedValue), false)
  assert.equal(result.error.includes(signingSecret), false)
  assert.equal(result.error.includes(task.approvalToken), false)
  assert.equal(result.error.includes('live-provider-token'), false)
  assert.equal(result.error.includes('plain-password'), false)
  assert.equal(result.error.includes('user:pass'), false)
  assert.equal(result.error.includes('query-token'), false)
  assert.equal(result.error.includes('BrowserPage.fill'), false)
  assert.equal(result.error.includes(BROWSER_RUNTIME_REDACTED), true)
  assert.ok(result.error.length <= BROWSER_RUNTIME_MAX_ERROR_LENGTH)
  assert.equal(result.evidence.at(-1)?.kind, 'error')
  assert.equal(result.evidence.at(-1)?.summary, result.error)
})

test('standalone sanitizer redacts JSON-style quoted sensitive fields', () => {
  const sanitized = sanitizeBrowserRuntimeError(
    new Error(
      'Provider payload: {"password":"json-password","api_key":"json-api-key",'
      + '"access_token":"json-access-token","cookie":"session=json-cookie"}',
    ),
  )

  assert.equal(sanitized.includes('json-password'), false)
  assert.equal(sanitized.includes('json-api-key'), false)
  assert.equal(sanitized.includes('json-access-token'), false)
  assert.equal(sanitized.includes('json-cookie'), false)
  assert.equal(sanitized.includes('"password":"[redacted]"'), true)
  assert.equal(sanitized.includes('"api_key":"[redacted]"'), true)
  assert.equal(sanitized.includes('"access_token":"[redacted]"'), true)
  assert.equal(sanitized.includes('"cookie":"[redacted]"'), true)
})

test('standalone sanitizer bounds untrusted non-Error output and removes control characters', () => {
  const unsafe = {
    message: `provider failure\u0000 api_key=secret-value ${'x'.repeat(900)}`,
  }
  const sanitized = sanitizeBrowserRuntimeError(unsafe)

  assert.equal(sanitized.includes('\u0000'), false)
  assert.equal(sanitized.includes('secret-value'), false)
  assert.equal(sanitized.includes(BROWSER_RUNTIME_REDACTED), true)
  assert.equal(sanitized.length, BROWSER_RUNTIME_MAX_ERROR_LENGTH)
})
