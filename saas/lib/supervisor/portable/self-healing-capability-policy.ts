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
  if (capability.mutation && capability.riskClass === 'routine_reversible') return 'write'
  return 'consequential'
}

/**
 * Adapts the Self-Healing Supervisor's registered API capability policy to the
 * generic Portable Connector Runtime without widening authority.
 *
 * Risk describes the operation itself; approval remains an independent gate:
 * - registered read-only actions may run unattended when autoExecutable;
 * - registered routine/reversible writes may run unattended only when
 *   autoExecutable=true and approvalRequired=false;
 * - disabled/non-auto actions remain discoverable but require approval;
 * - consequential or internally inconsistent capability declarations fail
 *   closed as consequential and approval-gated.
 *
 * Caller-supplied metadata cannot overwrite the authoritative governance facts.
 */
export function createSelfHealingPortableCapabilityDescriptor(
  input: SelfHealingCapabilityDescriptorInput,
): PortableCapabilityDescriptor {
  const risk = portableRisk(input.capability)
  const requiresApproval =
    risk === 'consequential' ||
    input.capability.approvalRequired ||
    !input.capability.autoExecutable

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
      ...(input.metadata ?? {}),
      selfHealingRiskClass: input.capability.riskClass,
      autoExecutable: input.capability.autoExecutable,
      approvalRequired: input.capability.approvalRequired,
      mutation: input.capability.mutation,
    }),
  })
}
