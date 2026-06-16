// saas/console-core/defaultHost.ts
//
// Portable engine wiring: the executor registry, a default log adapter, and a
// host assembler. This file has NO host-specific imports — authentication and
// policy live in the host layer (see ../console-host/) and are injected via
// createHost(). console-core stays provider- and company-agnostic.

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

// ---- Default log adapter (portable; hosts can replace) ----
// Structured server log by default. A host points this at Datadog / Logflare /
// CloudWatch or its audit table by passing its own LogAdapter to createHost().
export const consoleLogAdapter: LogAdapter = {
  async logAction(event) {
    console.log('[hub.engine]', JSON.stringify(event))
  },
}

// ---- Host assembler ----
// The host supplies an AuthAdapter (and optionally a LogAdapter). The engine
// never imports a specific auth/policy system — that is the portability seam.
export function createHost(auth: AuthAdapter, log: LogAdapter = consoleLogAdapter): EngineHost {
  return { auth, log, resolveExecutor }
}
