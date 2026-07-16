import { randomBytes } from 'crypto'
import {
  issueBrowserApprovalToken,
  verifyBrowserApprovalToken,
  type BrowserApprovalClaims,
} from '../../browser-runtime/approval.ts'
import type { BrowserTask } from '../../browser-runtime/contracts.ts'

function validateRequestedTtl(ttlMs: number | undefined, remainingLifetimeMs: number): void {
  if (ttlMs === undefined) return

  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('continuation_ttl_invalid')
  }

  // Browser Runtime approvals are strictly bound to the task's exact expiresAt value.
  // A shorter phase-two expiry would create a token that can never pass verification.
  if (ttlMs < remainingLifetimeMs) {
    throw new Error('continuation_ttl_conflicts_with_task_expiry')
  }
}

export function issueContinuationApproval(input: {
  task: BrowserTask
  executionId: string
  checkpointId: string
  remainingStepIds: string[]
  phaseOneApprovalDigest: string
  signingSecret: string
  now?: Date
  /**
   * Optional caller policy guard. This may reject a task whose remaining lifetime
   * exceeds the requested TTL, but it never rewrites the signed task expiry.
   * When omitted, the retained BrowserTask remains the sole time authority.
   */
  ttlMs?: number
}) {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const taskExpiry = Date.parse(input.task.expiresAt)

  if (!Number.isFinite(nowMs)) {
    throw new Error('continuation_approval_time_invalid')
  }

  if (!Number.isFinite(taskExpiry) || taskExpiry <= nowMs) {
    throw new Error('session_expired')
  }

  validateRequestedTtl(input.ttlMs, taskExpiry - nowMs)

  const claims: BrowserApprovalClaims = {
    version: 1,
    taskId: input.task.taskId,
    incidentId: input.task.incidentId,
    provider: input.task.provider,
    adapterId: input.task.adapterId,
    mode: input.task.mode,
    allowedStepIds: input.remainingStepIds,
    allowedOrigins: input.task.allowedOrigins,
    issuedAt: input.task.issuedAt,
    expiresAt: input.task.expiresAt,
    nonce: randomBytes(24).toString('base64url'),
    phase: 2,
    checkpointStepId: input.checkpointId,
    executionId: input.executionId,
    preApprovalTokenDigest: input.phaseOneApprovalDigest,
  }

  const token = issueBrowserApprovalToken(claims, input.signingSecret)

  // Self-verify the server-generated token against the same strict runtime boundary
  // before it can be handed to a continuation caller.
  verifyBrowserApprovalToken(token, input.task, input.signingSecret, now, {
    expectedStepIds: input.remainingStepIds,
    expectedPhase: 2,
    expectedCheckpointStepId: input.checkpointId,
    expectedExecutionId: input.executionId,
    expectedPreApprovalTokenDigest: input.phaseOneApprovalDigest,
  })

  return {
    task: input.task,
    token,
    claims: { ...claims, nonce: 'redacted' },
  }
}
