import {
  digestBrowserApprovalToken,
  type BrowserApprovalClaims,
} from '../../../browser-runtime/approval.ts'
import { SandboxExecutionError } from './sandbox-execution-errors.ts'

export interface SandboxApprovalReplayUse {
  token: string
  claims: Pick<BrowserApprovalClaims, 'taskId' | 'nonce' | 'phase' | 'expiresAt'>
}

export interface SandboxApprovalReplayGuard {
  consume(use: SandboxApprovalReplayUse, consumedAt?: Date): Promise<void>
}

export interface InMemorySandboxApprovalReplayGuardOptions {
  maxConsumedApprovals?: number
}

interface ConsumedApproval {
  digest: string
  nonce: string
  expiresAtMs: number
}

export const DEFAULT_MAX_CONSUMED_SANDBOX_APPROVALS = 1_024

function normalizeCapacity(value: number | undefined): number {
  const resolved = value ?? DEFAULT_MAX_CONSUMED_SANDBOX_APPROVALS
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error('Sandbox approval replay capacity must be a positive safe integer')
  }
  return resolved
}

function assertCanonicalIdentifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value !== value.trim()
  ) {
    throw new SandboxExecutionError(
      'invalid_approval_replay_claim',
      `${label} must be a non-empty canonical string`,
    )
  }
}

export class InMemorySandboxApprovalReplayGuard implements SandboxApprovalReplayGuard {
  private readonly approvalsByDigest = new Map<string, ConsumedApproval>()
  private readonly digestByNonce = new Map<string, string>()
  private readonly maxConsumedApprovals: number

  constructor(options: InMemorySandboxApprovalReplayGuardOptions = {}) {
    this.maxConsumedApprovals = normalizeCapacity(options.maxConsumedApprovals)
  }

  async consume(use: SandboxApprovalReplayUse, consumedAt = new Date()): Promise<void> {
    const consumedAtMs = consumedAt.getTime()
    if (!Number.isFinite(consumedAtMs)) {
      throw new SandboxExecutionError(
        'invalid_approval_replay_time',
        'Sandbox approval replay time must be valid.',
      )
    }

    assertCanonicalIdentifier(use.claims.taskId, 'Browser approval taskId')
    assertCanonicalIdentifier(use.claims.nonce, 'Browser approval nonce')
    if (use.claims.phase !== 1 && use.claims.phase !== 2) {
      throw new SandboxExecutionError(
        'invalid_approval_replay_claim',
        'Browser approval replay protection requires an explicit phase.',
      )
    }

    const expiresAtMs = Date.parse(use.claims.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= consumedAtMs) {
      throw new SandboxExecutionError(
        'expired_approval',
        'Browser approval token is expired and cannot be consumed.',
      )
    }

    this.pruneExpired(consumedAtMs)

    const digest = digestBrowserApprovalToken(use.token)
    if (this.approvalsByDigest.has(digest) || this.digestByNonce.has(use.claims.nonce)) {
      throw new SandboxExecutionError(
        'approval_replay_rejected',
        'Browser approval token or nonce has already been used.',
      )
    }

    if (this.approvalsByDigest.size >= this.maxConsumedApprovals) {
      throw new SandboxExecutionError(
        'approval_replay_capacity_reached',
        `Sandbox approval replay capacity reached (${this.maxConsumedApprovals}).`,
      )
    }

    const approval: ConsumedApproval = {
      digest,
      nonce: use.claims.nonce,
      expiresAtMs,
    }
    this.approvalsByDigest.set(digest, approval)
    this.digestByNonce.set(approval.nonce, digest)
  }

  clear(): void {
    this.approvalsByDigest.clear()
    this.digestByNonce.clear()
  }

  private pruneExpired(nowMs: number): void {
    for (const [digest, approval] of this.approvalsByDigest) {
      if (approval.expiresAtMs > nowMs) continue
      this.approvalsByDigest.delete(digest)
      if (this.digestByNonce.get(approval.nonce) === digest) {
        this.digestByNonce.delete(approval.nonce)
      }
    }
  }
}
