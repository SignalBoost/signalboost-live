// saas/platform-harness/capabilities/provider-hub-resolver.ts
//
// Provider Hub is the capability supply plane. The Harness never invents a tool:
// a capability must be requested, authorized, profile-compatible, AND currently
// discoverable for the exact tenant/environment/portable assignment.

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

export interface HarnessCapabilityResolution {
  satisfied: boolean
  resolved: Readonly<Record<string, PortableCapabilityDescriptor>>
  missing: readonly string[]
  reason?: string
}

export interface HarnessCapabilityResolverPort {
  resolve(manifest: HarnessManifest): Promise<HarnessCapabilityResolution>
}

const asPortableRisk = (
  grant: HarnessCapabilityGrant,
): PortableCapabilityRisk => {
  const risk: HarnessCapabilityRisk = grant.risk ?? (grant.mutating ? 'write' : 'read')
  return risk
}

export function createProviderHubHarnessCapabilityResolver(
  discovery: PortableCapabilityDiscoveryPort,
): HarnessCapabilityResolverPort {
  return Object.freeze({
    async resolve(manifest: HarnessManifest): Promise<HarnessCapabilityResolution> {
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
