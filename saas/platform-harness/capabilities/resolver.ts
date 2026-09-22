import type { HarnessCapabilityGrant, HarnessManifest } from '../core/types.ts'

export interface DiscoveredHarnessCapability {
  id: string
  source: 'mcp' | 'native' | 'agent'
  available: boolean
}

export interface HarnessCapabilityResolution {
  executable: readonly HarnessCapabilityGrant[]
  unavailable: readonly string[]
  discoveredButUnauthorized: readonly string[]
}

export function resolveAvailableCapabilities(
  manifest: HarnessManifest,
  discovered: readonly DiscoveredHarnessCapability[],
): HarnessCapabilityResolution {
  const byId = new Map(discovered.map(item => [item.id, item]))
  const authorized = new Set(manifest.capabilities.map(item => item.id))
  return Object.freeze({
    executable: Object.freeze(manifest.capabilities.filter(grant => byId.get(grant.id)?.available === true)),
    unavailable: Object.freeze(manifest.capabilities.filter(grant => byId.get(grant.id)?.available !== true).map(grant => grant.id)),
    discoveredButUnauthorized: Object.freeze(discovered.filter(item => item.available && !authorized.has(item.id)).map(item => item.id)),
  })
}
