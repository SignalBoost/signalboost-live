// saas/console-core/defaultHost.ts
//
// The default ConsoleHost for THIS app. This is the ONE place coupling lives:
// it bridges the portable AuthAdapter / LogAdapter / executor registry to the
// existing auth + policy modules. Another company replaces this file with their
// own bridges (Auth0, Clerk, Datadog, …) and the engine is unchanged.

import type { NextRequest } from 'next/server'
import { getCurrentUser as resolveHubUser } from '@/lib/auth/permission-middleware'
import { getHubActionPolicy, isActionBlocked, requiresOwnerApproval } from '@/lib/hub/action-policy'
import type { AuthAdapter, LogAdapter } from './types'
import type { EngineHost, RegisteredExecutor } from './actionEngine'

// ---- Executor registry ----
const REGISTRY = new Map<string, RegisteredExecutor>()

/** Register a provider action with the engine (call at module load). */
export function registerExecutor(e: RegisteredExecutor): void {
  REGISTRY.set(`${e.providerId}.${e.actionId}`, e)
}
export function resolveExecutor(providerId: string, actionId: string): RegisteredExecutor | null {
  return REGISTRY.get(`${providerId}.${actionId}`) || null
}
export function listRegistered(): string[] {
  return Array.from(REGISTRY.keys())
}

// ---- Default auth adapter (bridges to the existing auth + policy layers) ----
function defaultAuth(req: NextRequest): AuthAdapter {
  return {
    async getCurrentUser() {
      const u = await resolveHubUser(req)
      if (!u) return null
      return { id: u.id, email: (u as any).email, roles: [(u as any).role].filter(Boolean) }
    },
    hasPermission(user, _providerId, policyActionId) {
      const policy = getHubActionPolicy(policyActionId)
      // Read-only actions (approval 'none') are ungated — pickers/lists populate
      // even when the auth layer is unavailable. Mutations require a user.
      if (policy.approval === 'none') return true
      if (!user) return false
      if (isActionBlocked(policyActionId)) return false
      if (requiresOwnerApproval(policyActionId) && !(user.roles || []).includes('owner')) return false
      return true
    },
  }
}

// ---- Default log adapter (safe, swappable) ----
// Structured server log by default. Hosts point this at Datadog / Logflare /
// CloudWatch or their audit table by replacing this object.
const defaultLog: LogAdapter = {
  async logAction(event) {
    console.log('[hub.engine]', JSON.stringify(event))
  },
}

/** Assemble the default host for one request. */
export function createDefaultHost(req: NextRequest): EngineHost {
  return { auth: defaultAuth(req), log: defaultLog, resolveExecutor }
}
