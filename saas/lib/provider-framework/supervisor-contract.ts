import type { UniversalProviderCapability } from './types.ts'
import { classifyProviderFailure, openProviderCircuit, readProviderCircuit } from '@/lib/supervisor/provider-circuit.ts'

export const PROVIDER_SUPERVISOR_CONTRACT_VERSION = 'universal-provider-supervisor-contract-v1' as const

export type ProviderExecutionGuardInput = Readonly<{
  db: any
  providerId: string
  capability: UniversalProviderCapability | string
  costBearing?: boolean
}>

function capabilityId(value: UniversalProviderCapability | string): string {
  return String(typeof value === 'string' ? value : value.capabilityId).trim().toLowerCase()
}

/**
 * Mandatory execution preflight for provider adapters.
 * Provider-specific code does not decide whether an open circuit may be bypassed.
 */
export async function assertProviderExecutionAllowed(input: ProviderExecutionGuardInput) {
  const providerId = String(input.providerId || '').trim().toLowerCase()
  const capability = capabilityId(input.capability)
  if (!providerId || !capability) throw new Error('provider_supervisor_identity_invalid')
  const circuit = await readProviderCircuit({ db: input.db, providerId, capability })
  if (circuit.open && (input.costBearing !== false || !circuit.costBearingRetryAllowed)) {
    const error = new Error('provider_supervisor_circuit_open')
    ;(error as any).providerId = providerId
    ;(error as any).capability = capability
    ;(error as any).failureClass = circuit.failureClass
    ;(error as any).reason = circuit.reason
    throw error
  }
  return Object.freeze({ allowed: true as const, providerId, capability, contract: PROVIDER_SUPERVISOR_CONTRACT_VERSION })
}

/**
 * Mandatory failure observation hook. All provider adapters can feed their native error/log
 * representation into the same Supervisor classifier and containment state machine.
 */
export async function recordProviderExecutionFailure(input: {
  db: any
  providerId: string
  capability: UniversalProviderCapability | string
  observations: readonly string[]
  evidence?: Record<string, unknown>
}) {
  const classification = classifyProviderFailure(input.observations)
  const circuit = await openProviderCircuit({
    db: input.db,
    providerId: input.providerId,
    capability: capabilityId(input.capability),
    classification,
    evidence: {
      contract: PROVIDER_SUPERVISOR_CONTRACT_VERSION,
      ...(input.evidence || {}),
    },
  })
  return Object.freeze({ classification, circuit })
}
