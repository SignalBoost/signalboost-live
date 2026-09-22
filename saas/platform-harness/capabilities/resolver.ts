import {
  resolvePortableCapabilities,
  type PortableCapabilityDescriptor,
  type PortableCapabilityDiscoveryPort,
  type PortableCapabilityRisk,
} from '../../provider-hub-core/capability-runtime.ts'
import type {
  HarnessCapabilityGrant,
  HarnessCapabilityRisk,
  HarnessManifest,
} from '../core/types.ts'

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

/**
 * Pure intersection helper retained from the first integration.
 * Discovery can remove capabilities from a manifest; it can never add authority.
 */
export function resolveAvailableCapabilities(
  manifest: HarnessManifest,
  discovered: readonly DiscoveredHarnessCapability[],
): HarnessCapabilityResolution {
  const byId = new Map(discovered.map(item => [item.id, item]))
  const authorized = new Set(manifest.capabilities.map(item => item.id))
  return Object.freeze({
    executable: Object.freeze(
      manifest.capabilities.filter(grant => byId.get(grant.id)?.available === true),
    ),
    unavailable: Object.freeze(
      manifest.capabilities
        .filter(grant => byId.get(grant.id)?.available !== true)
        .map(grant => grant.id),
    ),
    discoveredButUnauthorized: Object.freeze(
      discovered
        .filter(item => item.available && !authorized.has(item.id))
        .map(item => item.id),
    ),
  })
}

export interface ProviderHubHarnessResolution {
  satisfied: boolean
  resolved: Readonly<Record<string, PortableCapabilityDescriptor>>
  missing: readonly string[]
  reason?: string
}

export interface HarnessCapabilityResolverPort {
  resolve(manifest: HarnessManifest): Promise<ProviderHubHarnessResolution>
}

function asPortableRisk(grant: HarnessCapabilityGrant): PortableCapabilityRisk {
  const risk: HarnessCapabilityRisk = grant.risk ?? (grant.mutating ? 'write' : 'read')
  return risk
}

/**
 * Host-neutral Provider Hub resolver.
 *
 * The exact executable surface is:
 * requested ∩ profile ∩ trusted authority ∩ Provider Hub assignment/availability.
 */
export function createProviderHubHarnessCapabilityResolver(
  discovery: PortableCapabilityDiscoveryPort,
): HarnessCapabilityResolverPort {
  return Object.freeze({
    async resolve(manifest: HarnessManifest): Promise<ProviderHubHarnessResolution> {
      const tenantId = String(manifest.identity.tenantId ?? '').trim()
      if (!tenantId) {
        return Object.freeze({
          satisfied: false,
          resolved: Object.freeze({}),
          missing: Object.freeze(manifest.capabilities.map(item => item.id)),
          reason: 'harness_provider_hub_tenant_required',
        })
      }

      const portableId = String(
        manifest.identity.portableId ?? manifest.identity.agentId,
      ).trim()

      const available = await discovery.discover({
        tenantId,
        environmentId: manifest.environment.environmentId,
        portableId,
      })

      const resolution = resolvePortableCapabilities({
        portableId,
        manifestVersion: `platform-harness:${manifest.runId}`,
        requirements: manifest.capabilities.map(grant => ({
          capabilityId: grant.id,
          required: true,
          allowedRisk: asPortableRisk(grant),
          requiredScopes: grant.scopes,
          preferredProviders: grant.preferredProviders,
        })),
      }, available)

      return Object.freeze({
        satisfied: resolution.satisfied,
        resolved: resolution.resolved,
        missing: resolution.missing,
        ...(resolution.satisfied
          ? {}
          : { reason: 'harness_provider_hub_capability_unavailable' }),
      })
    },
  })
}
