// saas/console-core/providerRegistry.ts
//
// Builds the live provider registry from provider-map.json + console.config.ts.
// The console UI discovers providers from HERE — never from hard-coded imports —
// which is what makes the whole thing portable and plug-and-play.

import providerMap from '@/config/provider-map.json'
import { consoleConfig } from './console.config'
import type { ProviderMeta, EnvSlot } from './types'

interface RawProvider {
  tier: 1 | 2 | 3 | 4
  displayName: string
  category: string
  accent: string
  icon: string
  envVars: EnvSlot[]
  actions?: Record<string, unknown>
  remoteSelect?: Record<string, unknown>
  remoteList?: Record<string, unknown>
}

const RAW = (providerMap as { providers: Record<string, RawProvider> }).providers

/** Resolve the host's actual env-var name for a canonical key (honors envRemap). */
export function resolveEnvKey(providerId: string, canonicalKey: string): string {
  return consoleConfig.envRemap?.[providerId]?.[canonicalKey] || canonicalKey
}

/** Is this provider enabled by config? */
function isEnabled(id: string): boolean {
  return consoleConfig.enabledProviders === '*' || consoleConfig.enabledProviders.includes(id)
}

/** Provider metadata for every enabled provider, sorted by tier then name. */
export function getProviderRegistry(): ProviderMeta[] {
  return Object.entries(RAW)
    .filter(([id]) => isEnabled(id))
    .map(([id, p]) => ({
      id,
      displayName: p.displayName,
      tier: p.tier,
      category: p.category,
      accent: p.accent,
      icon: p.icon,
      envVars: p.envVars,
    }))
    .sort((a, b) => a.tier - b.tier || a.displayName.localeCompare(b.displayName))
}

/** Group the registry by tier (1–4) for the sidebar. */
export function getProvidersByTier(): Record<1 | 2 | 3 | 4, ProviderMeta[]> {
  const out: Record<1 | 2 | 3 | 4, ProviderMeta[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const p of getProviderRegistry()) out[p.tier].push(p)
  return out
}

/** The full raw entry (actions, remoteSelect, remoteList) for one provider. */
export function getProviderConfig(id: string): RawProvider | null {
  return isEnabled(id) ? RAW[id] || null : null
}

export const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Tier 1 · Core Infrastructure',
  2: 'Tier 2 · Media & Search',
  3: 'Tier 3 · Messaging & Analytics',
  4: 'Tier 4 · Specialized APIs',
}
