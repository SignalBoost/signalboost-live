import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDescriptor,
  type PortableCapabilityDiscoveryPort,
  type PortableCapabilityRisk,
} from '../provider-hub-core/index.ts'
import { loadSocialCapabilityInventory } from '../lib/outreach/social-capability-inventory.ts'
import { loadAdsCapabilityInventory } from '../lib/ads/ads-capability-inventory.ts'

export const MARKETING_SALES_CAPABILITY_BRIDGE_VERSION = 'marketing-sales-provider-hub-bridge-v1' as const

export interface MarketingSalesCapabilityGrantPort {
  isAllowed(input: {
    tenantId: string
    environmentId: string
    portableId: string
    capabilityId: string
    providerId: string
    risk: PortableCapabilityRisk
  }): Promise<boolean>
}

export interface MarketingSalesCapabilityDiscoveryOptions {
  /** SignalBoost service-role datastore; the bridge only emits sanitized readiness metadata. */
  admin: { from: (table: string) => any }
  /** Connection owner whose already-connected Marketing + Sales accounts are being projected. */
  userId: string
  /** Fixed owner scope. A discovery request outside it never touches this user's connections. */
  tenantId: string
  environmentId: string
  /** Existing Provider Hub discovery can be composed instead of replaced. */
  upstream?: PortableCapabilityDiscoveryPort
  /** Exact cross-portable authorization. Absent means deny every consumer except Marketing + Sales itself. */
  grants?: MarketingSalesCapabilityGrantPort
  env?: Record<string, string | undefined>
}

export function createStaticMarketingSalesCapabilityGrants(
  grants: Readonly<Record<string, readonly string[]>>,
): MarketingSalesCapabilityGrantPort {
  const normalized = new Map<string, ReadonlySet<string>>()
  for (const [portableId, capabilityIds] of Object.entries(grants || {})) {
    const id = String(portableId || '').trim()
    if (!id) continue
    normalized.set(id, new Set((capabilityIds || []).map(value => String(value || '').trim()).filter(Boolean)))
  }
  return Object.freeze({
    async isAllowed(input) {
      return normalized.get(input.portableId)?.has(input.capabilityId) === true
    },
  })
}

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Marketing + Sales capability bridge ${field} is required`)
  return normalized
}

function canonicalSocialProvider(platform: string): string {
  if (platform === 'facebook_pages' || platform === 'instagram_business') return 'meta'
  if (platform === 'linkedin_company' || platform === 'linkedin_member') return 'linkedin'
  if (platform === 'youtube_channels') return 'youtube'
  if (platform === 'twitter_x') return 'x'
  return platform
}

async function authorized(
  options: MarketingSalesCapabilityDiscoveryOptions,
  input: { tenantId: string; environmentId: string; portableId: string; capabilityId: string; providerId: string; risk: PortableCapabilityRisk },
): Promise<boolean> {
  // The source portable may always discover the capabilities it already owns. This does not
  // change its execution path or approvals; it simply projects them into Provider Hub.
  if (input.portableId === 'marketing-sales') return true
  if (!options.grants) return false
  return options.grants.isAllowed(input)
}

function connectionScopes(observed: readonly string[] | undefined, declared: readonly string[]): readonly string[] {
  return observed?.length ? observed.map(String) : declared.map(String)
}

async function socialDescriptors(
  options: MarketingSalesCapabilityDiscoveryOptions,
  scope: { tenantId: string; environmentId: string; portableId: string },
): Promise<PortableCapabilityDescriptor[]> {
  const inventory = await loadSocialCapabilityInventory({ admin: options.admin, userId: options.userId, env: options.env })
  const descriptors: PortableCapabilityDescriptor[] = []

  for (const platform of inventory.platforms) {
    const providerId = canonicalSocialProvider(platform.platform)
    const scopes = connectionScopes(platform.token?.scopes, platform.scopes)
    const connectionId = `marketing-sales-social:${platform.platform}`

    const readCapability = `social.${platform.platform}.destinations.read`
    if (await authorized(options, { ...scope, capabilityId: readCapability, providerId, risk: 'read' })) {
      descriptors.push(createPortableCapabilityDescriptor({
        capabilityId: readCapability,
        providerId,
        connectionId,
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        risk: 'read',
        availability: platform.connected ? 'available' : 'unavailable',
        requiresApproval: false,
        scopes,
        metadata: {
          bridge: MARKETING_SALES_CAPABILITY_BRIDGE_VERSION,
          sourcePortable: 'marketing-sales',
          platform: platform.platform,
          label: platform.label,
          connected: platform.connected,
          needsAccountRef: platform.needsAccountRef,
        },
      }))
    }

    const publishCapability = `social.${platform.platform}.publish`
    if (await authorized(options, { ...scope, capabilityId: publishCapability, providerId, risk: 'write' })) {
      descriptors.push(createPortableCapabilityDescriptor({
        capabilityId: publishCapability,
        providerId,
        connectionId,
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        risk: 'write',
        availability: platform.publishReady ? 'available' : 'unavailable',
        // The existing Marketing + Sales publishing path already requires owner approval.
        // Provider Hub must never weaken that boundary when another portable discovers it.
        requiresApproval: true,
        scopes,
        metadata: {
          bridge: MARKETING_SALES_CAPABILITY_BRIDGE_VERSION,
          sourcePortable: 'marketing-sales',
          platform: platform.platform,
          label: platform.label,
          contentKind: platform.contentKind,
          publishReady: platform.publishReady,
          noFakeSuccess: true,
        },
      }))
    }
  }
  return descriptors
}

async function adsDescriptors(
  options: MarketingSalesCapabilityDiscoveryOptions,
  scope: { tenantId: string; environmentId: string; portableId: string },
): Promise<PortableCapabilityDescriptor[]> {
  const inventory = await loadAdsCapabilityInventory({ admin: options.admin, env: options.env })
  const descriptors: PortableCapabilityDescriptor[] = []

  for (const network of inventory.networks) {
    const providerId = network.platformId
    const connectionId = `marketing-sales-ads:${network.platformId}`
    const metadata = {
      bridge: MARKETING_SALES_CAPABILITY_BRIDGE_VERSION,
      sourcePortable: 'marketing-sales',
      platform: network.platformId,
      label: network.label,
      connected: network.connected,
      tokenSource: network.tokenSource,
      accountRefPresent: network.accountRefPresent,
    } as const

    for (const capabilityId of [
      `ads.${network.platformId}.account.read`,
      `ads.${network.platformId}.spend.read`,
    ]) {
      if (!await authorized(options, { ...scope, capabilityId, providerId, risk: 'read' })) continue
      descriptors.push(createPortableCapabilityDescriptor({
        capabilityId,
        providerId,
        connectionId,
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        risk: 'read',
        availability: network.ready ? 'available' : 'unavailable',
        requiresApproval: false,
        scopes: network.scopes,
        metadata,
      }))
    }

    for (const capabilityId of [
      `ads.${network.platformId}.campaign.create`,
      `ads.${network.platformId}.campaign.pause`,
    ]) {
      if (!await authorized(options, { ...scope, capabilityId, providerId, risk: 'consequential' })) continue
      descriptors.push(createPortableCapabilityDescriptor({
        capabilityId,
        providerId,
        connectionId,
        tenantId: scope.tenantId,
        environmentId: scope.environmentId,
        risk: 'consequential',
        availability: network.ready ? 'available' : 'unavailable',
        // Financial mutation remains behind the Marketing + Sales spend/content gates and
        // Provider Hub approval policy. This bridge exposes capability, not execution authority.
        requiresApproval: true,
        scopes: network.scopes,
        metadata,
      }))
    }
  }
  return descriptors
}

/**
 * Add the adapters Marketing + Sales already owns to Provider Hub discovery without duplicating
 * OAuth, tokens, provider SDK logic, publishing, or ad-spend execution. Another portable sees an
 * exact capability only after the host explicitly grants it. The returned port is discovery-only;
 * existing Marketing + Sales governed execution remains authoritative until the shared write
 * runtime's approval/idempotency/audit semantics are independently hardened and accepted.
 */
export function createMarketingSalesCapabilityDiscovery(
  options: MarketingSalesCapabilityDiscoveryOptions,
): PortableCapabilityDiscoveryPort {
  const ownerTenant = required(options.tenantId, 'tenantId')
  const ownerEnvironment = required(options.environmentId, 'environmentId')
  required(options.userId, 'userId')

  return Object.freeze({
    async discover(input) {
      const tenantId = required(input.tenantId, 'discover.tenantId')
      const environmentId = required(input.environmentId, 'discover.environmentId')
      const portableId = String(input.portableId || '').trim()
      const upstream = options.upstream ? await options.upstream.discover(input) : []

      // The fixed SignalBoost connection owner must never be queried from another tenant/env.
      if (tenantId !== ownerTenant || environmentId !== ownerEnvironment || !portableId) {
        return Object.freeze([...upstream])
      }

      const scope = { tenantId, environmentId, portableId }
      const [social, ads] = await Promise.all([
        socialDescriptors(options, scope),
        adsDescriptors(options, scope),
      ])

      return Object.freeze([...upstream, ...social, ...ads])
    },
  })
}
