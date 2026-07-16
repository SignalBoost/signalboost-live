import test from 'node:test'
import assert from 'node:assert/strict'
import {
  InMemoryApprovalQueueStore,
  approvalRequestSchemaVersion,
  issueContinuationApproval,
  parseApproveDecision,
} from '../lib/supervisor/approvals/index.ts'
import {
  digestBrowserApprovalToken,
  verifyBrowserApprovalToken,
} from '../lib/browser-runtime/approval.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const issuedAt = '2026-07-16T00:00:00.000Z'
const expiresAt = '2026-07-16T00:10:00.000Z'
const executionId = 'b'.repeat(64)

function req(overrides: Record<string, unknown> = {}) {
  return {
    approvalRequestId: overrides.approvalRequestId || 'req-1',
    executionId: overrides.executionId || 'exec-1',
    dispatchId: 'dispatch-1',
    incidentId: 'incident-1',
    planId: 'plan-1',
    packageId: 'pkg-1',
    packageFingerprint: 'f'.repeat(64),
    provider: 'sandbox',
    environment: 'sandbox',
    targetOrigin: 'http://localhost:4173',
    checkpointId: 'approval-checkpoint',
    remainingStepIds: ['save', 'verify'],
    protectedStepSummaries: [{ stepId: 'save', summary: 'step save' }],
    evidenceReferences: [],
    phaseOneApprovalDigest: 'a'.repeat(64),
    requestedAt: issuedAt,
    expiresAt,
    status: 'pending',
    schemaVersion: approvalRequestSchemaVersion,
    ...overrides,
  } as const
}

function task(): BrowserTask {
  return {
    taskId: 'task-1',
    incidentId: 'incident-1',
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'prepare_change',
    issuedAt,
    expiresAt,
    allowedOrigins: ['http://localhost:4173'],
    approvalToken: 'phase-one',
    steps: [
      {
        id: 'approval-checkpoint',
        kind: 'checkpoint',
        label: 'checkpoint',
        requiresApproval: true,
      },
      { id: 'save', kind: 'click', selector: '#save' },
      { id: 'verify', kind: 'screenshot', label: 'verify' },
    ],
  }
}

function continuationInput(overrides: Record<string, unknown> = {}) {
  const browserTask = task()
  return {
    task: browserTask,
    executionId,
    checkpointId: 'approval-checkpoint',
    remainingStepIds: ['save', 'verify'],
    phaseOneApprovalDigest: digestBrowserApprovalToken(browserTask.approvalToken),
    signingSecret: 'secret',
    now: new Date('2026-07-16T00:05:00.000Z'),
    ...overrides,
  }
}

test('approval queue enforces sandbox and one active request per execution', async () => {
  const store = new InMemoryApprovalQueueStore()
  await store.createRequest(req())

  await assert.rejects(
    () => store.createRequest(req({ approvalRequestId: 'req-2' })),
    /active_request_exists/,
  )
  await assert.rejects(
    () =>
      store.createRequest(
        req({ approvalRequestId: 'req-3', executionId: 'exec-2', environment: 'production' }),
      ),
    /environment_invalid|non_sandbox/,
  )
})

test('client cannot override continuation claims', () => {
  assert.throws(() => parseApproveDecision({ remainingStepIds: ['x'] }), /client_override/)
  assert.throws(
    () => parseApproveDecision({ targetOrigin: 'https://evil.test' }),
    /client_override/,
  )
  assert.throws(() => parseApproveDecision({ approvalToken: 'x' }), /client_override/)
})

test('server-generated continuation preserves exact task time binding and verifies immediately', () => {
  const input = continuationInput()
  const issued = issueContinuationApproval(input)

  assert.equal(issued.claims.issuedAt, input.task.issuedAt)
  assert.equal(issued.claims.expiresAt, input.task.expiresAt)
  assert.equal(issued.claims.nonce, 'redacted')

  const claims = verifyBrowserApprovalToken(
    issued.token,
    issued.task,
    input.signingSecret,
    input.now,
    {
      expectedPhase: 2,
      expectedStepIds: input.remainingStepIds,
      expectedCheckpointStepId: input.checkpointId,
      expectedExecutionId: input.executionId,
      expectedPreApprovalTokenDigest: input.phaseOneApprovalDigest,
    },
  )

  assert.equal(claims.executionId, executionId)
  assert.equal(claims.expiresAt, expiresAt)
  assert.deepEqual(claims.allowedOrigins, ['http://localhost:4173'])
})

test('continuation issuance rejects a requested TTL that would rewrite the retained task expiry', () => {
  assert.throws(
    () => issueContinuationApproval(continuationInput({ ttlMs: 60_000 })),
    /continuation_ttl_conflicts_with_task_expiry/,
  )

  assert.doesNotThrow(() =>
    issueContinuationApproval(continuationInput({ ttlMs: 5 * 60_000 })),
  )
})

test('continuation issuance fails closed for invalid clocks and expired retained tasks', () => {
  assert.throws(
    () => issueContinuationApproval(continuationInput({ now: new Date('invalid') })),
    /continuation_approval_time_invalid/,
  )
  assert.throws(
    () =>
      issueContinuationApproval(
        continuationInput({ now: new Date('2026-07-16T00:10:00.000Z') }),
      ),
    /session_expired/,
  )
})

test('approval one-time consumption and terminal rejection are fail closed', async () => {
  const store = new InMemoryApprovalQueueStore()
  await store.createRequest(req())
  await store.approveRequest('exec-1', 'op', issuedAt)
  await store.markConsumed('exec-1', issuedAt)

  await assert.rejects(
    () => store.markConsumed('exec-1', issuedAt),
    /request_not_actionable|terminal/,
  )

  await store.createRequest(req({ approvalRequestId: 'req-2', executionId: 'exec-2' }))
  await store.rejectRequest('exec-2', 'op', 'operator_rejected', undefined, issuedAt)
  await assert.rejects(
    () => store.approveRequest('exec-2', 'op', issuedAt),
    /request_not_actionable|terminal/,
  )
})
