import { A2A_AGENT_REGISTRY_VERSION, type A2AAgentRegistryPort, type A2ATransportFactory } from './a2a-agent-registry.ts'
import { installCOSA2ARuntimeHost } from './cos-runtime-host.ts'
import { createPortableA2AHost, type PortableA2AHostOptions } from './portable-a2a-host.ts'

export const A2A_HOST_ACTIVATION_VERSION = 'signalboost-a2a-host-activation-v1' as const

export interface A2AHostActivationSummary {
  version: typeof A2A_HOST_ACTIVATION_VERSION
  activatedAt: string
  enabledAgentCount: number
  enabledAssignmentCount: number
  transportRefs: readonly string[]
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A host activation ${name} is required`)
  if (normalized === '*') throw new Error(`A2A host activation ${name} does not allow wildcard scope`)
  return normalized
}

export async function validateA2AHostActivation(registry: A2AAgentRegistryPort, now: () => Date = () => new Date()): Promise<A2AHostActivationSummary> {
  const snapshot = await registry.snapshot()
  if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')

  const enabledAgents = snapshot.agents.filter(agent => agent.enabled)
  if (enabledAgents.length === 0) throw new Error('a2a_activation_no_enabled_agents')
  const enabledAgentIds = new Set(enabledAgents.map(agent => agent.agentId))
  const enabledAssignments = snapshot.assignments.filter(assignment => assignment.enabled && enabledAgentIds.has(assignment.agentId))
  if (enabledAssignments.length === 0) throw new Error('a2a_activation_no_enabled_assignments')

  for (const assignment of enabledAssignments) {
    required(assignment.tenantId, 'tenantId')
    required(assignment.environmentId, 'environmentId')
    required(assignment.portableId, 'portableId')
  }

  const transportRefs = [...new Set(enabledAgents.map(agent => required(agent.transportRef, 'transportRef')))].sort()
  return Object.freeze({
    version: A2A_HOST_ACTIVATION_VERSION,
    activatedAt: now().toISOString(),
    enabledAgentCount: enabledAgents.length,
    enabledAssignmentCount: enabledAssignments.length,
    transportRefs: Object.freeze(transportRefs),
  })
}

export async function activatePortableA2AHost(options: PortableA2AHostOptions & { now?: () => Date }) {
  const summary = await validateA2AHostActivation(options.registry, options.now)
  const host = createPortableA2AHost(options)
  return Object.freeze({ host, summary })
}

export async function activateCOSA2AHost(options: PortableA2AHostOptions & { now?: () => Date }) {
  const activated = await activatePortableA2AHost(options)
  const dispose = installCOSA2ARuntimeHost(activated.host)
  return Object.freeze({ ...activated, dispose })
}

export type A2AHostActivationOptions = {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
} & Omit<PortableA2AHostOptions, 'registry' | 'transportFactory'>
