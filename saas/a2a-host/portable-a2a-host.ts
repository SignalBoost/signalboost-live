import { createA2ADelegationRuntime, type A2ADelegationAuditPort } from './a2a-delegation-runtime.ts'
import { createCOSSpecialistOrchestrator } from './cos-specialist-orchestrator.ts'
import type { A2AAgentRegistryPort, A2ATransportFactory } from './a2a-agent-registry.ts'
import type { A2ARuntimeObservationPort } from './a2a-runtime-observability.ts'

export const PORTABLE_A2A_HOST_VERSION = 'signalboost-portable-a2a-host-v1' as const

export interface PortableA2AHostOptions {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  audit?: A2ADelegationAuditPort
  observe?: A2ARuntimeObservationPort
  timeoutMs?: number
  requireAuditForConsequential?: boolean
}

/**
 * Framework-neutral composition root shared by COS and buyer portables.
 * Endpoint resolution, TLS, auth, credentials, buyer identity, persistence,
 * approval issuance, audit storage, and telemetry persistence stay outside this module.
 */
export function createPortableA2AHost(options: PortableA2AHostOptions) {
  const delegation = createA2ADelegationRuntime({
    registry: options.registry,
    transportFactory: options.transportFactory,
    audit: options.audit,
    observe: options.observe,
    timeoutMs: options.timeoutMs,
    requireAuditForConsequential: options.requireAuditForConsequential,
  })
  const orchestrator = createCOSSpecialistOrchestrator({ registry: options.registry, delegation })
  return Object.freeze({
    version: PORTABLE_A2A_HOST_VERSION,
    registry: options.registry,
    delegation,
    orchestrator,
  })
}

export type PortableA2AHost = ReturnType<typeof createPortableA2AHost>
