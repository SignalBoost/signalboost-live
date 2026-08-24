import { AsyncLocalStorage } from 'node:async_hooks'

type PublicAuditIdentityState = {
  userId: string | null
}

const publicAuditIdentityScope = new AsyncLocalStorage<PublicAuditIdentityState>()

/**
 * Server-only correlation identity for public Concierge audit/provenance persistence.
 *
 * This is deliberately separate from authorization. Public Concierge execution still runs inside
 * publicDeliveryScope, where getAccess() returns guest and no owner/admin/private-company authority
 * is available to COS. The audit identity carries only the already-authenticated user id so a
 * response can be bound to durable provenance and retrieved by an immediate provenance follow-up.
 */
export function publicAuditUserId(): string | null {
  return publicAuditIdentityScope.getStore()?.userId ?? null
}

export function withPublicAuditIdentity<T>(userId: string | null, work: () => T): T {
  return publicAuditIdentityScope.run({ userId: userId || null }, work)
}
