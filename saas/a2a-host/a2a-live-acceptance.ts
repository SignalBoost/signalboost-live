import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'
import type { A2AAgentRegistryPort, A2ATransportFactory } from './a2a-agent-registry.ts'
import { A2A_AGENT_REGISTRY_VERSION } from './a2a-agent-registry.ts'
import { activatePortableA2AHost } from './a2a-host-activation.ts'
import { createInMemoryA2ARuntimeObserver, type A2ARuntimeObservationEvent, type A2ARuntimeObservationPort } from './a2a-runtime-observability.ts'
import type { A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'

export const A2A_LIVE_ACCEPTANCE_VERSION = 'signalboost-a2a-live-acceptance-v1' as const

export interface A2ALiveAcceptanceRecord {
  schemaVersion: typeof A2A_LIVE_ACCEPTANCE_VERSION
  acceptedAt: string
  protocolVersion: string
  agentCardName: string
  agentId: string
  familyId: A2ASpecialistFamilyId
  skillId: string
  tenantId: string
  environmentId: string
  portableId: string
  traceId: string
  mode: string
  remoteObserved: boolean
  observationEventId: string
  durationMs: number
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A live acceptance ${name} is required`)
  if (normalized === '*') throw new Error(`A2A live acceptance ${name} does not allow wildcard scope`)
  return normalized
}

export async function runA2ALiveAcceptance(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  fetchAgentCard: () => Promise<unknown>
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  familyId: A2ASpecialistFamilyId
  skillId: string
  messageText: string
  messageId: string
  traceId: string
  externalObserver?: A2ARuntimeObservationPort
  timeoutMs?: number
  now?: () => Date
}): Promise<A2ALiveAcceptanceRecord> {
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')
  const agentId = required(options.agentId, 'agentId')
  const skillId = required(options.skillId, 'skillId')
  const traceId = required(options.traceId, 'traceId')
  const messageId = required(options.messageId, 'messageId')
  const messageText = required(options.messageText, 'messageText')

  const card = validateA2AAgentCard(await options.fetchAgentCard())
  const preferred = String(card.preferredTransport ?? 'JSONRPC').toUpperCase()
  if (preferred !== 'JSONRPC') throw new Error(`a2a_live_acceptance_transport_unsupported:${preferred}`)
  if (!card.skills.some(skill => skill.id === skillId)) throw new Error(`a2a_live_acceptance_skill_not_advertised:${skillId}`)

  const snapshot = await options.registry.snapshot()
  if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')
  const assignment = snapshot.assignments.find(item =>
    item.enabled && item.agentId === agentId && item.tenantId === tenantId &&
    item.environmentId === environmentId && item.portableId === portableId,
  )
  const assignedSkill = assignment?.allowedSkills.find(item => item.skillId === skillId)
  if (!assignment || !assignedSkill) throw new Error(`a2a_live_acceptance_assignment_missing:${skillId}`)
  if (assignedSkill.risk !== 'advisory') throw new Error(`a2a_live_acceptance_advisory_only:${skillId}`)

  const memory = createInMemoryA2ARuntimeObserver()
  const observer: A2ARuntimeObservationPort = Object.freeze({
    async append(event: A2ARuntimeObservationEvent) {
      await memory.append(event)
      if (options.externalObserver) {
        try { await options.externalObserver.append(event) } catch { /* evidence sink is non-authoritative */ }
      }
    },
  })

  const activated = await activatePortableA2AHost({
    registry: options.registry,
    transportFactory: options.transportFactory,
    observe: observer,
    timeoutMs: options.timeoutMs,
    now: options.now,
  })
  const result = await activated.host.orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId,
    text: messageText,
    traceId,
    plan: { familyId: options.familyId, skillId, agentId },
  })
  if (!result.ok || result.mode !== 'delegated') throw new Error(`a2a_live_acceptance_delegation_failed:${result.mode || 'unknown'}`)

  const event = memory.snapshot().find(item => item.traceId === traceId && item.agentId === agentId && item.skillId === skillId)
  if (!event || !event.ok || event.mode !== 'delegated') throw new Error('a2a_live_acceptance_remote_observation_missing')

  return Object.freeze({
    schemaVersion: A2A_LIVE_ACCEPTANCE_VERSION,
    acceptedAt: event.occurredAt,
    protocolVersion: card.protocolVersion,
    agentCardName: card.name,
    agentId,
    familyId: options.familyId,
    skillId,
    tenantId,
    environmentId,
    portableId,
    traceId,
    mode: event.mode,
    remoteObserved: true,
    observationEventId: event.eventId,
    durationMs: event.durationMs,
  })
}
