// Host-neutral capability contracts for SignalBoost Portables.
// This module discovers what a tenant connection can do; it does not resolve secrets
// or execute consequential provider mutations.

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
}

export interface PortableCapabilityRequirement {
  capabilityId: string
  required: boolean
  allowedRisk: PortableCapabilityRisk
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

export function createPortableCapabilityDescriptor(input: Omit<PortableCapabilityDescriptor, 'schemaVersion'>): PortableCapabilityDescriptor {
  const descriptor: PortableCapabilityDescriptor = {
    ...input,
    schemaVersion: PORTABLE_CONNECTOR_CAPABILITY_SCHEMA_VERSION,
    capabilityId: required(input.capabilityId, 'capabilityId'),
    providerId: required(input.providerId, 'providerId'),
    connectionId: required(input.connectionId, 'connectionId'),
    tenantId: required(input.tenantId, 'tenantId'),
    environmentId: required(input.environmentId, 'environmentId'),
    scopes: Object.freeze([...new Set(input.scopes.map(scope => required(scope, 'scope')))]),
  }

  if (descriptor.risk === 'consequential' && !descriptor.requiresApproval) {
    throw new Error('consequential capabilities must require approval')
  }

  return Object.freeze(descriptor)
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
    const candidate = available.find(capability =>
      capability.capabilityId === capabilityId &&
      capability.availability === 'available' &&
      RISK_ORDER[capability.risk] <= RISK_ORDER[requirement.allowedRisk],
    )

    if (candidate) resolved[capabilityId] = candidate
    else if (requirement.required) missing.push(capabilityId)
  }

  return Object.freeze({
    portableId,
    satisfied: missing.length === 0,
    resolved: Object.freeze(resolved),
    missing: Object.freeze(missing),
  })
}
