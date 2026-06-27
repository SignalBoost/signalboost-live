// saas/lib/cos/host.ts
// The portability seam. The COS module never imports the host's auth directly; instead the
// host provides an identity adapter. SignalBoost's binding (see app/api/cos/... routes)
// implements this with getCurrentUser; another buyer implements it with their own auth.

export interface CosIdentity {
  id: string
  email?: string
  role?: string // owner | admin | operator | member | …
}

export interface CosHost {
  /** Resolve the caller from a framework request, or null if unauthenticated. */
  getIdentity(req: unknown): Promise<CosIdentity | null>
}

const ADMIN_ROLES = new Set(['owner', 'admin'])

/** True if the identity may see cross-user mining intelligence (admin cockpit). */
export function isMiningAdmin(identity: CosIdentity | null | undefined): boolean {
  return !!identity && ADMIN_ROLES.has(identity.role || '')
}

/** True if `viewer` may read `targetUserId`'s features (self, or admin). */
export function canReadUser(identity: CosIdentity | null | undefined, targetUserId: string): boolean {
  if (!identity) return false
  return identity.id === targetUserId || isMiningAdmin(identity)
}
