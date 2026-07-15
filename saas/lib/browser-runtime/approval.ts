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
}

export interface BrowserApprovalVerificationScope {
  expectedStepIds?: string[]
  expectedPhase?: 1 | 2
  expectedCheckpointStepId?: string
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
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
  if (claims.expiresAt !== task.expiresAt) throw new Error('Approval token expiry mismatch')
  if (new Date(claims.expiresAt).getTime() <= now.getTime()) throw new Error('Browser approval token expired')
  if (new Date(claims.issuedAt).getTime() > now.getTime() + 60_000) throw new Error('Browser approval token issued in the future')
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

  return claims
}
