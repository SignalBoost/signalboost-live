// saas/agent-gateway/continuity.ts
//
// Deterministic, host-neutral continuity primitives for the Universal Agent Gateway.
// This module does not execute requests. It establishes durable request identity,
// idempotent admission, ownership leases, and fencing so replicas can recover work
// without duplicate or stale-owner execution.

import { createHash } from 'node:crypto'

export type ContinuityClock = () => Date

export interface ContinuityRequestIdentityInput {
  tenantId: string
  environment: string
  protocol: string
  requestId: string
  actionKind: string
  target: string
}

export interface ContinuityRequestIdentity {
  schemaVersion: 'agent-gateway-continuity-identity-v1'
  key: string
  digest: string
  tenantId: string
  environment: string
  protocol: string
  requestId: string
  actionKind: string
  target: string
  readOnly: true
  executable: false
}

export interface ContinuityLease {
  schemaVersion: 'agent-gateway-continuity-lease-v1'
  requestKey: string
  ownerId: string
  fencingToken: number
  acquiredAt: string
  expiresAt: string
  readOnly: true
  executable: false
}

export type ContinuityAdmission =
  | { disposition: 'acquired'; identity: ContinuityRequestIdentity; lease: ContinuityLease }
  | { disposition: 'duplicate'; identity: ContinuityRequestIdentity; lease: ContinuityLease }
  | { disposition: 'busy'; identity: ContinuityRequestIdentity; lease: ContinuityLease }

export interface ContinuityStore {
  getLease(requestKey: string): Promise<ContinuityLease | null>
  putLease(lease: ContinuityLease): Promise<void>
  nextFencingToken(requestKey: string): Promise<number>
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!IDENTIFIER.test(normalized)) throw new Error(`invalid continuity ${field}`)
  return normalized
}

function canonical(input: ContinuityRequestIdentityInput): Omit<ContinuityRequestIdentity, 'schemaVersion' | 'key' | 'digest' | 'readOnly' | 'executable'> {
  return {
    tenantId: required(input.tenantId, 'tenantId'),
    environment: required(input.environment, 'environment'),
    protocol: required(input.protocol, 'protocol'),
    requestId: required(input.requestId, 'requestId'),
    actionKind: required(input.actionKind, 'actionKind'),
    target: required(input.target, 'target'),
  }
}

export function createContinuityRequestIdentity(input: ContinuityRequestIdentityInput): ContinuityRequestIdentity {
  const normalized = canonical(input)
  const payload = JSON.stringify(normalized)
  const digest = createHash('sha256').update(payload).digest('hex')
  return Object.freeze({
    schemaVersion: 'agent-gateway-continuity-identity-v1',
    key: `agw_${digest}`,
    digest,
    ...normalized,
    readOnly: true,
    executable: false,
  })
}

function validDuration(leaseDurationMs: number): number {
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 300_000) {
    throw new Error('invalid continuity lease duration')
  }
  return leaseDurationMs
}

function validClock(clock: ContinuityClock): Date {
  const now = clock()
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid continuity clock')
  return now
}

export class AgentGatewayContinuityController {
  constructor(
    private readonly store: ContinuityStore,
    private readonly clock: ContinuityClock = () => new Date(),
  ) {}

  async admit(
    input: ContinuityRequestIdentityInput,
    ownerId: string,
    leaseDurationMs = 30_000,
  ): Promise<ContinuityAdmission> {
    const identity = createContinuityRequestIdentity(input)
    const owner = required(ownerId, 'ownerId')
    const duration = validDuration(leaseDurationMs)
    const now = validClock(this.clock)
    const existing = await this.store.getLease(identity.key)

    if (existing && Date.parse(existing.expiresAt) > now.getTime()) {
      return Object.freeze({
        disposition: existing.ownerId === owner ? 'duplicate' : 'busy',
        identity,
        lease: existing,
      }) as ContinuityAdmission
    }

    const fencingToken = await this.store.nextFencingToken(identity.key)
    if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
      throw new Error('invalid continuity fencing token')
    }

    const lease: ContinuityLease = Object.freeze({
      schemaVersion: 'agent-gateway-continuity-lease-v1',
      requestKey: identity.key,
      ownerId: owner,
      fencingToken,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + duration).toISOString(),
      readOnly: true,
      executable: false,
    })
    await this.store.putLease(lease)
    return Object.freeze({ disposition: 'acquired', identity, lease })
  }

  assertCurrentOwner(lease: ContinuityLease, current: ContinuityLease | null): void {
    if (!current) throw new Error('continuity lease missing')
    if (lease.requestKey !== current.requestKey) throw new Error('continuity request mismatch')
    if (lease.ownerId !== current.ownerId || lease.fencingToken !== current.fencingToken) {
      throw new Error('continuity stale owner rejected')
    }
    const now = validClock(this.clock)
    if (Date.parse(current.expiresAt) <= now.getTime()) throw new Error('continuity lease expired')
  }
}

export class InMemoryContinuityStore implements ContinuityStore {
  private readonly leases = new Map<string, ContinuityLease>()
  private readonly tokens = new Map<string, number>()

  async getLease(requestKey: string): Promise<ContinuityLease | null> {
    return this.leases.get(requestKey) ?? null
  }

  async putLease(lease: ContinuityLease): Promise<void> {
    this.leases.set(lease.requestKey, lease)
  }

  async nextFencingToken(requestKey: string): Promise<number> {
    const next = (this.tokens.get(requestKey) ?? 0) + 1
    this.tokens.set(requestKey, next)
    return next
  }
}
