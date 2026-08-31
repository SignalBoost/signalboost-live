import { createInMemoryA2AAgentRegistry } from './a2a-agent-registry.ts'
import { createA2AHttpJsonRpcTransportFactory } from './a2a-http-jsonrpc-transport.ts'
import { createPortableA2AHost, type PortableA2AHost } from './portable-a2a-host.ts'
import { referenceDiagnosticEndpoint } from './reference-a2a-config.ts'
import type { A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'

export const REFERENCE_COS_A2A_HOST_VERSION = 'signalboost-reference-cos-a2a-host-v1' as const
export const REFERENCE_DIAGNOSTIC_AGENT_ID = 'signalboost-reference-self-healing-diagnostic' as const
const REFERENCE_TRANSPORT_REF = 'signalboost-reference-https-jsonrpc' as const

export interface ExactA2AScope {
  tenantId: string
  environmentId: string
  portableId: string
}

function exact(value: string, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`a2a_reference_scope_invalid:${name}`)
  return normalized
}

export function isReferenceDiagnosticPlan(plan: { familyId?: unknown; skillId?: unknown } | null | undefined): boolean {
  return String(plan?.familyId ?? '') === 'self-healing-diagnostic' && String(plan?.skillId ?? '') === 'self-healing.diagnose'
}

/**
 * Real SignalBoost-owned fallback host used only when a buyer host is absent.
 * Its registry grant is created for one exact request scope and exposes one advisory skill.
 */
export function createReferenceCOSA2AHost(scope: ExactA2AScope, env: NodeJS.ProcessEnv = process.env): PortableA2AHost {
  const tenantId = exact(scope.tenantId, 'tenantId')
  const environmentId = exact(scope.environmentId, 'environmentId')
  const portableId = exact(scope.portableId, 'portableId')
  const endpoint = referenceDiagnosticEndpoint(env)

  const registry = createInMemoryA2AAgentRegistry({
    agents: [{
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      displayName: 'SignalBoost Reference Self-Healing Diagnostic Specialist',
      description: 'Read-only reference specialist for incident diagnosis before buyer-owned agents are available.',
      transportRef: REFERENCE_TRANSPORT_REF,
      enabled: true,
      advertisedSkillIds: ['self-healing.diagnose'],
      metadata: { owner: 'signalboost', acceptanceClass: 'signalboost-reference-live' },
    }],
    assignments: [{
      assignmentId: `reference:${tenantId}:${environmentId}:${portableId}`,
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId: 'self-healing.diagnose', risk: 'advisory' }],
    }],
  })

  const transportFactory = createA2AHttpJsonRpcTransportFactory({
    connectionResolver: {
      resolve(input) {
        if (input.agentId !== REFERENCE_DIAGNOSTIC_AGENT_ID || input.transportRef !== REFERENCE_TRANSPORT_REF) {
          throw new Error('a2a_reference_transport_not_authorized')
        }
        if (input.scope.tenantId !== tenantId || input.scope.environmentId !== environmentId || input.scope.portableId !== portableId) {
          throw new Error('a2a_reference_transport_scope_mismatch')
        }
        return { endpoint }
      },
    },
  })

  return createPortableA2AHost({ registry, transportFactory, timeoutMs: 10_000 })
}

export function selectCOSA2AHostForPlan(input: {
  installedHost: PortableA2AHost | null
  scope: ExactA2AScope
  plan: { familyId: A2ASpecialistFamilyId; skillId: string }
  env?: NodeJS.ProcessEnv
}): { host: PortableA2AHost | null; source: 'buyer-installed' | 'signalboost-reference' | 'none' } {
  if (input.installedHost) return { host: input.installedHost, source: 'buyer-installed' }
  if (!isReferenceDiagnosticPlan(input.plan)) return { host: null, source: 'none' }
  return { host: createReferenceCOSA2AHost(input.scope, input.env), source: 'signalboost-reference' }
}
