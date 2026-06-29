// saas/lib/integrations/registry.ts
// Generic registry + capability dispatch. Adding a provider never touches callers:
// they ask the registry to run a capability and get an honest result — real when the
// adapter implements it, "not wired yet" when it only declares it, "refuse" when the
// tenant hasn't connected. No fake success, ever.
import type { IntegrationProvider, IntegrationCategory, IntegrationContext, IntegrationResult, Capability } from './types'
import { CAPABILITY_METHOD } from './types'

const REGISTRY = new Map<string, IntegrationProvider>()

export function registerProvider(p: IntegrationProvider): void {
  REGISTRY.set(p.id, p)
}
export function getProvider(id: string): IntegrationProvider | null {
  return REGISTRY.get(id) || null
}
export function listProviders(): IntegrationProvider[] {
  return Array.from(REGISTRY.values())
}
export function listByCategory(category: IntegrationCategory): IntegrationProvider[] {
  return listProviders().filter((p) => p.category === category)
}

// Does this provider both declare AND implement the capability?
export function supportsCapability(p: IntegrationProvider, cap: Capability): boolean {
  if (!p.capabilities.includes(cap)) return false
  const method = CAPABILITY_METHOD[cap]
  return !!method && typeof (p as any)[method] === 'function'
}

// Uniform dispatch. Honest outcomes:
//   provider missing            -> { ok:false, mode:'unknown_provider' }
//   capability not declared      -> { ok:false, mode:'capability_not_supported' }
//   declared but not implemented -> { ok:false, mode:'not_implemented' }
//   not connected (no creds)     -> { ok:false, mode:'not_connected' }
//   else -> the adapter's real result
export async function runCapability(
  providerId: string,
  cap: Capability,
  ctx: IntegrationContext,
  args: Record<string, any>,
): Promise<IntegrationResult> {
  const p = getProvider(providerId)
  if (!p) return { ok: false, mode: 'unknown_provider', error: providerId }
  if (!p.capabilities.includes(cap)) return { ok: false, mode: 'capability_not_supported', error: cap }
  const method = CAPABILITY_METHOD[cap]
  const fn = method ? (p as any)[method] : undefined
  if (typeof fn !== 'function') return { ok: false, mode: 'not_implemented', error: `${providerId}.${cap}` }
  const connected = !!ctx.accessToken || !!ctx.refreshToken || !!ctx.apiKey
  if (!connected) return { ok: false, mode: 'not_connected', error: providerId }
  try {
    const r = await fn(ctx, args)
    return r && typeof r === 'object' ? r : { ok: false, mode: 'bad_adapter_result' }
  } catch (e) {
    return { ok: false, mode: `${providerId}_error`, error: e instanceof Error ? e.message : 'capability failed' }
  }
}

import type { TaskTemplate } from './types'
import { TASK_TEMPLATES } from './types'

// Expand a provider's declared capabilities into runnable console task templates.
export function tasksFor(p: IntegrationProvider): TaskTemplate[] {
  const out: TaskTemplate[] = []
  for (const c of p.capabilities) { const t = TASK_TEMPLATES[c]; if (t) out.push({ capability: c, ...t }) }
  return out
}
