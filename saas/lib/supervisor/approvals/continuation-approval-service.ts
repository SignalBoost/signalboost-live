import { randomBytes } from 'crypto'
import { issueBrowserApprovalToken, type BrowserApprovalClaims } from '../../browser-runtime/approval.ts'
import type { BrowserTask } from '../../browser-runtime/contracts.ts'

export function issueContinuationApproval(input: {
  task: BrowserTask
  executionId: string
  checkpointId: string
  remainingStepIds: string[]
  phaseOneApprovalDigest: string
  signingSecret: string
  now?: Date
  ttlMs?: number
}) {
  const now = input.now ?? new Date()
  const taskExpiry = Date.parse(input.task.expiresAt)

  if (!Number.isFinite(taskExpiry) || taskExpiry <= now.getTime()) {
    throw new Error('session_expired')
  }

  const requestedExpiry = now.getTime() + Math.min(Math.max(input.ttlMs ?? 5 * 60_000, 30_000), 10 * 60_000)
  const expiresAt = new Date(Math.min(taskExpiry, requestedExpiry)).toISOString()

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
    expiresAt,
    nonce: randomBytes(24).toString('base64url'),
    phase: 2,
    checkpointStepId: input.checkpointId,
    executionId: input.executionId,
    preApprovalTokenDigest: input.phaseOneApprovalDigest,
  }

  return {
    task: input.task,
    token: issueBrowserApprovalToken(claims, input.signingSecret),
    claims: { ...claims, nonce: 'redacted' },
  }
}
