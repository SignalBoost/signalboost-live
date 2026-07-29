// saas/lib/supervisor/executors/approval-continuation.ts
//
// A consequential API step may execute only when the caller supplies a signed,
// single-use continuation proof bound to the exact incident, plan, dispatch and
// approved step scope. The verifier is host-agnostic: the buyer supplies its
// approver public keys, durable nonce store and audit-event lookup.

import { verify as verifySignature } from 'node:crypto'

export const APPROVAL_CONTINUATION_SCHEMA_VERSION = 'supervisor-approval-continuation-v1'

export interface ApprovalContinuationProof {
  schemaVersion: typeof APPROVAL_CONTINUATION_SCHEMA_VERSION
  incidentId: string
  planId: string
  dispatchId: string
  approvedStepIds: string[]
  approverId: string
  approvedAt: string
  expiresAt: string
  nonce: string
  keyId: string
  previousAuditEventId: string
  signature: string
}

export interface ApprovalContinuationContext {
  incidentId: string
  planId: string
  dispatchId: string
  approvedStepIds: string[]
}

export interface ApprovalContinuationVerdict {
  valid: boolean
  reason: string
  approverId?: string
  previousAuditEventId?: string
}

export interface ApprovalNonceStore {
  /** Atomically consume a nonce. Return false when it was already used. */
  consume(nonce: string, expiresAt: string): Promise<boolean> | boolean
}

export interface ApprovalContinuationVerifier {
  verify(proof: ApprovalContinuationProof, context: ApprovalContinuationContext): Promise<ApprovalContinuationVerdict> | ApprovalContinuationVerdict
}

export interface Ed25519ApprovalVerifierOptions {
  publicKeyFor(keyId: string): Promise<string | undefined> | string | undefined
  nonceStore: ApprovalNonceStore
  previousAuditEventExists(input: {
    eventId: string
    incidentId: string
    planId: string
    approvedStepIds: string[]
  }): Promise<boolean> | boolean
  now?: () => Date
  maximumClockSkewMs?: number
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function sameOrderedScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function unsignedProof(proof: ApprovalContinuationProof): Omit<ApprovalContinuationProof, 'signature'> {
  const { signature: _signature, ...unsigned } = proof
  return unsigned
}

/** Stable payload used by both the signer and verifier. */
export function canonicalApprovalPayload(proof: ApprovalContinuationProof): string {
  const value = unsignedProof(proof)
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    incidentId: value.incidentId,
    planId: value.planId,
    dispatchId: value.dispatchId,
    approvedStepIds: [...value.approvedStepIds],
    approverId: value.approverId,
    approvedAt: value.approvedAt,
    expiresAt: value.expiresAt,
    nonce: value.nonce,
    keyId: value.keyId,
    previousAuditEventId: value.previousAuditEventId,
  })
}

function decodeSignature(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

function invalid(reason: string): ApprovalContinuationVerdict {
  return { valid: false, reason }
}

export function createEd25519ApprovalVerifier(options: Ed25519ApprovalVerifierOptions): ApprovalContinuationVerifier {
  const now = options.now ?? (() => new Date())
  const maximumClockSkewMs = options.maximumClockSkewMs ?? 5 * 60_000

  return {
    async verify(proof, context) {
      try {
        if (!proof || proof.schemaVersion !== APPROVAL_CONTINUATION_SCHEMA_VERSION) return invalid('approval proof schema is unsupported')
        if (!Array.isArray(proof.approvedStepIds) || proof.approvedStepIds.length === 0) return invalid('approval proof scope is empty')
        if (new Set(proof.approvedStepIds).size !== proof.approvedStepIds.length) return invalid('approval proof scope contains duplicate step IDs')
        for (const field of ['incidentId', 'planId', 'dispatchId', 'approverId', 'approvedAt', 'expiresAt', 'nonce', 'keyId', 'previousAuditEventId', 'signature'] as const) {
          if (!nonEmpty(proof[field])) return invalid(`approval proof is missing ${field}`)
        }
        if (proof.incidentId !== context.incidentId) return invalid('approval proof incident does not match')
        if (proof.planId !== context.planId) return invalid('approval proof plan does not match')
        if (proof.dispatchId !== context.dispatchId) return invalid('approval proof dispatch does not match')
        if (!sameOrderedScope(proof.approvedStepIds, context.approvedStepIds)) return invalid('approval proof scope does not exactly match')

        const approvedAtMs = Date.parse(proof.approvedAt)
        const expiresAtMs = Date.parse(proof.expiresAt)
        const nowMs = now().getTime()
        if (!Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs)) return invalid('approval proof timestamps are invalid')
        if (expiresAtMs <= approvedAtMs) return invalid('approval proof expiration must follow approval time')
        if (expiresAtMs <= nowMs) return invalid('approval proof has expired')
        if (approvedAtMs > nowMs + maximumClockSkewMs) return invalid('approval proof approval time is in the future')

        const publicKey = await options.publicKeyFor(proof.keyId)
        if (!nonEmpty(publicKey)) return invalid('approval proof signing key is unknown')
        const signatureValid = verifySignature(null, Buffer.from(canonicalApprovalPayload(proof), 'utf8'), publicKey, decodeSignature(proof.signature))
        if (!signatureValid) return invalid('approval proof signature is invalid')

        const eventExists = await options.previousAuditEventExists({
          eventId: proof.previousAuditEventId,
          incidentId: proof.incidentId,
          planId: proof.planId,
          approvedStepIds: [...proof.approvedStepIds],
        })
        if (!eventExists) return invalid('approval proof does not reference a valid prior pause event')

        const consumed = await options.nonceStore.consume(proof.nonce, proof.expiresAt)
        if (!consumed) return invalid('approval proof nonce was already used')

        return {
          valid: true,
          reason: 'signed approval continuation accepted',
          approverId: proof.approverId,
          previousAuditEventId: proof.previousAuditEventId,
        }
      } catch (error) {
        return invalid(`approval proof validation failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    },
  }
}

/** Evaluation-only nonce store. Production buyers must inject a durable atomic store. */
export class InMemoryApprovalNonceStore implements ApprovalNonceStore {
  private readonly consumed = new Set<string>()

  consume(nonce: string): boolean {
    if (this.consumed.has(nonce)) return false
    this.consumed.add(nonce)
    return true
  }
}
