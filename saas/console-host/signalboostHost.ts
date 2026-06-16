// saas/console-host/signalboostHost.ts
//
// SignalBoost's host bridge for the portable console engine. This is the single
// place where the engine meets THIS app's auth + policy. Another company
// replaces this file (Auth0, Clerk, their own RBAC, …) and console-core is
// unchanged.

import type { NextRequest } from 'next/server'
import { getCurrentUser as resolveHubUser } from '@/lib/auth/permission-middleware'
import { isActionBlocked, requiresOwnerApproval } from '@/lib/hub/action-policy'
import type { AuthAdapter } from '@/console-core/types'
import type { EngineHost } from '@/console-core/actionEngine'
import { createHost } from '@/console-core/defaultHost'

function signalboostAuth(req: NextRequest): AuthAdapter {
  return {
    async getCurrentUser() {
      const u = await resolveHubUser(req)
      if (!u) return null
      return { id: u.id, email: (u as any).email, roles: [(u as any).role].filter(Boolean) }
    },
    hasPermission(user, _providerId, policyActionId) {
      // Authentication is required for EVERY action — no read-only bypass.
      if (!user) return false
      if (isActionBlocked(policyActionId)) return false
      if (requiresOwnerApproval(policyActionId) && !(user.roles || []).includes('owner')) return false
      return true
    },
  }
}

/** Assemble the SignalBoost host for one request. */
export function createSignalBoostHost(req: NextRequest): EngineHost {
  return createHost(signalboostAuth(req))
}
