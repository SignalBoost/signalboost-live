// Host-neutral capability discovery for SignalBoost Portables.
// Credentials never cross this boundary. The buyer's host resolves them locally.

export const PORTABLE_CONNECTOR_CAPABILITY_SCHEMA_VERSION = 'portable-connector-capability-v1' as const

export type PortableCapabilityRisk = 'read' | 'write' | 'consequential'
export type PortableCapabilityAvailability = 'available' | 'degraded' | 'unavailable'

export interface PortableCapabilityDescriptor {
  schemaVersion: typeof PORTABLE_CONNECTOR_CAPABILITY_SCHEMA_VERSION
  capabilityId: string
  providerId: string
  connectionId: string
  tenantId: string
  environmentId: string
  risk: PortableCapabilityRisk
  availability: PortableCapabilityAvailability
  requiresApproval: boolean
  scopes: readonly string[]
  inputSchemaId?: string
  outputSchemaId?: string
  healthCheckedAt?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface PortableCapabilityRequirement {
  capabilityId: string
  required: boolean
  allowedRisk: PortableCapabilityRisk
  requiredScopes?: readonly string[]
  preferredProviders?: readonly string[]
}

export interface PortableCapabilityManifest {
  portableId: string
  manifestVersion: string
  requirements: readonly PortableCapabilityRequirement[]
}

export interface PortableCapabilityDiscoveryPort {
  discover(input: {
    tenantId: string
    environmentId: string
    portableId?: string
  }): Promise<readonly PortableCapabilityDescriptor[]>
}

export interface PortableCapabilityResolution {
  portableId: string
  satisfied: boolean
  resolved: Readonly<Record<string, PortableCapabilityDescriptor>>
  missing: readonly string[]
}

const RISK_ORDER: Record<PortableCapabilityRisk, number> = { read: 0, write: 1, consequential: 2 }

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(value => required(value, 'scope')))])
}

export function createPortableCapabilityDescriptor(input: Omit<PortableCapabilityDescriptor, 'schemaVersion'>): PortableCapabilityDescriptor {
  const descriptor: PortableCapabilityDescriptor = {
    ...input,
    schemaVersion: PORTABLE_CONNECTOR_CAPABILITY_SCHEMA_VERSION,
    capabilityId: required(input.capabilityId, 'capabilityId'),
    providerId: required(input.providerId, 'providerId'),
    connectionId: required(input.connectionId, 'connectionId'),
    tenantId: required(input.tenantId, 'tenantId'),
    environmentId: required(input.environmentId, 'environmentId'),
    scopes: unique(input.scopes),
    healthCheckedAt: input.healthCheckedAt ? new Date(input.healthCheckedAt).toISOString() : undefined,
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
  }

  if (descriptor.risk === 'consequential' && !descriptor.requiresApproval) {
    throw new Error('consequential capabilities must require approval')
  }

  return Object.freeze(descriptor)
}

function hasRequiredScopes(candidate: PortableCapabilityDescriptor, requiredScopes: readonly string[] | undefined): boolean {
  if (!requiredScopes?.length) return true
  const available = new Set(candidate.scopes)
  return requiredScopes.every(scope => available.has(scope))
}

function providerPreference(candidate: PortableCapabilityDescriptor, preferredProviders: readonly string[] | undefined): number {
  if (!preferredProviders?.length) return Number.MAX_SAFE_INTEGER
  const index = preferredProviders.indexOf(candidate.providerId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function resolvePortableCapabilities(
  manifest: PortableCapabilityManifest,
  available: readonly PortableCapabilityDescriptor[],
): PortableCapabilityResolution {
  const portableId = required(manifest.portableId, 'portableId')
  required(manifest.manifestVersion, 'manifestVersion')

  const resolved: Record<string, PortableCapabilityDescriptor> = {}
  const missing: string[] = []

  for (const requirement of manifest.requirements) {
    const capabilityId = required(requirement.capabilityId, 'capabilityId')
    const candidates = available
      .filter(capability =>
        capability.capabilityId === capabilityId &&
        capability.availability === 'available' &&
        RISK_ORDER[capability.risk] <= RISK_ORDER[requirement.allowedRisk] &&
        hasRequiredScopes(capability, requirement.requiredScopes),
      )
      .sort((a, b) => providerPreference(a, requirement.preferredProviders) - providerPreference(b, requirement.preferredProviders))

    if (candidates[0]) resolved[capabilityId] = candidates[0]
    else if (requirement.required) missing.push(capabilityId)
  }

  return Object.freeze({
    portableId,
    satisfied: missing.length === 0,
    resolved: Object.freeze(resolved),
    missing: Object.freeze(missing),
  })
}
