import type { ApiCapability } from '../executors/api-capability-registry.ts'
import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDescriptor,
  type PortableCapabilityRisk,
} from '../../../provider-hub-core/capability-runtime.ts'

export interface SelfHealingCapabilityDescriptorInput {
  capability: ApiCapability
  capabilityId?: string
  connectionId: string
  tenantId: string
  environmentId: string
  scopes?: readonly string[]
  providerId?: string
  healthCheckedAt?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

function portableRisk(capability: ApiCapability): PortableCapabilityRisk {
  if (!capability.mutation && capability.riskClass === 'read_only') return 'read'
  if (
    capability.mutation &&
    capability.riskClass === 'routine_reversible' &&
    capability.autoExecutable &&
    !capability.approvalRequired
  ) return 'write'
  return 'consequential'
}

/**
 * Adapts the Self-Healing Supervisor's established execution policy to the
 * generic Portable Connector Runtime without widening authority.
 *
 * - read-only: unattended, when explicitly registered;
 * - routine + reversible: unattended only when explicitly registered as
 *   autoExecutable and approvalRequired=false;
 * - everything else: consequential and approval-gated.
 *
 * A buyer may always choose a stricter capability by setting approvalRequired.
 */
export function createSelfHealingPortableCapabilityDescriptor(
  input: SelfHealingCapabilityDescriptorInput,
): PortableCapabilityDescriptor {
  const risk = portableRisk(input.capability)
  const requiresApproval = risk === 'consequential' || input.capability.approvalRequired

  return createPortableCapabilityDescriptor({
    capabilityId: input.capabilityId ?? input.capability.actionId,
    providerId: input.providerId ?? input.capability.provider,
    connectionId: input.connectionId,
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    risk,
    availability: 'available',
    requiresApproval,
    scopes: input.scopes ?? [],
    healthCheckedAt: input.healthCheckedAt,
    metadata: Object.freeze({
      selfHealingRiskClass: input.capability.riskClass,
      autoExecutable: input.capability.autoExecutable,
      ...(input.metadata ?? {}),
    }),
  })
}
