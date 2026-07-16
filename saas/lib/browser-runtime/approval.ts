import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type { BrowserTask, BrowserTaskMode } from './contracts.ts'

export interface BrowserApprovalClaims {
  version: 1
  taskId: string
  incidentId: string
  provider: string
  adapterId: string
  mode: BrowserTaskMode
  allowedStepIds: string[]
  allowedOrigins: string[]
  issuedAt: string
  expiresAt: string
  nonce: string
  phase?: 1 | 2
  checkpointStepId?: string
  executionId?: string
  preApprovalTokenDigest?: string
}

export interface BrowserApprovalVerificationScope {
  expectedStepIds?: string[]
  expectedPhase?: 1 | 2
  expectedCheckpointStepId?: string
  expectedExecutionId?: string
  expectedPreApprovalTokenDigest?: string
}

const MAX_ISSUED_AT_CLOCK_SKEW_MS = 60_000
const CANONICAL_APPROVAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function parseApprovalTimestamp(value: string, label: 'issuedAt' | 'expiresAt'): number {
  if (typeof value !== 'string' || !CANONICAL_APPROVAL_TIMESTAMP.test(value)) {
    throw new Error(`Browser approval token ${label} must be a canonical UTC ISO timestamp`)
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`Browser approval token ${label} must be a canonical UTC ISO timestamp`)
  }
  return parsed
}

export function digestBrowserApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function issueBrowserApprovalToken(claims: BrowserApprovalClaims, secret: string): string {
  if (!secret) throw new Error('Browser approval signing secret is required')
  const payload = encode(JSON.stringify(claims))
  return `${payload}.${signature(payload, secret)}`
}

export function verifyBrowserApprovalToken(
  token: string,
  task: BrowserTask,
  secret: string,
  now = new Date(),
  scope: BrowserApprovalVerificationScope = {},
): BrowserApprovalClaims {
  if (!secret) throw new Error('Browser approval signing secret is required')
  const [payload, suppliedSignature, extra] = String(token || '').split('.')
  if (!payload || !suppliedSignature || extra) throw new Error('Malformed browser approval token')

  const expected = Buffer.from(signature(payload, secret))
  const supplied = Buffer.from(suppliedSignature)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error('Invalid browser approval token signature')
  }

  const claims = JSON.parse(decode(payload)) as BrowserApprovalClaims
  const exactStepIds = scope.expectedStepIds ?? task.steps.map(step => step.id)

  if (claims.version !== 1) throw new Error('Unsupported browser approval token version')
  if (claims.taskId !== task.taskId) throw new Error('Approval token taskId mismatch')
  if (claims.incidentId !== task.incidentId) throw new Error('Approval token incidentId mismatch')
  if (claims.provider !== task.provider) throw new Error('Approval token provider mismatch')
  if (claims.adapterId !== task.adapterId) throw new Error('Approval token adapterId mismatch')
  if (claims.mode !== task.mode) throw new Error('Approval token mode mismatch')
  if (claims.issuedAt !== task.issuedAt) throw new Error('Approval token issuedAt mismatch')
  if (claims.expiresAt !== task.expiresAt) throw new Error('Approval token expiry mismatch')

  const issuedAtMs = parseApprovalTimestamp(claims.issuedAt, 'issuedAt')
  const expiresAtMs = parseApprovalTimestamp(claims.expiresAt, 'expiresAt')
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) throw new Error('Browser approval verification time must be valid')
  if (expiresAtMs <= issuedAtMs) {
    throw new Error('Browser approval token expiry must be after issuedAt')
  }
  if (expiresAtMs <= nowMs) throw new Error('Browser approval token expired')
  if (issuedAtMs > nowMs + MAX_ISSUED_AT_CLOCK_SKEW_MS) {
    throw new Error('Browser approval token issued in the future')
  }
  if (JSON.stringify(claims.allowedStepIds) !== JSON.stringify(exactStepIds)) {
    throw new Error('Approval token does not authorize the exact browser steps')
  }
  if (JSON.stringify(claims.allowedOrigins) !== JSON.stringify(task.allowedOrigins)) {
    throw new Error('Approval token origin scope mismatch')
  }
  if (scope.expectedPhase !== undefined && claims.phase !== scope.expectedPhase) {
    throw new Error(`Approval token phase mismatch: expected phase ${scope.expectedPhase}`)
  }
  if (
    scope.expectedCheckpointStepId !== undefined &&
    claims.checkpointStepId !== scope.expectedCheckpointStepId
  ) {
    throw new Error('Approval token checkpoint scope mismatch')
  }
  if (scope.expectedExecutionId !== undefined && claims.executionId !== scope.expectedExecutionId) {
    throw new Error('Approval token execution scope mismatch')
  }
  if (
    scope.expectedPreApprovalTokenDigest !== undefined &&
    claims.preApprovalTokenDigest !== scope.expectedPreApprovalTokenDigest
  ) {
    throw new Error('Approval token pre-approval scope mismatch')
  }

  return claims
}
