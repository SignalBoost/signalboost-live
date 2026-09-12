import { createHash } from 'node:crypto'
import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'
import { A2A_AGENT_REGISTRY_VERSION, type A2AAgentRegistryPort, type A2ATransportFactory } from './a2a-agent-registry.ts'
import { activatePortableA2AHost } from './a2a-host-activation.ts'
import { createInMemoryA2ARuntimeObserver, type A2ARuntimeObservationEvent, type A2ARuntimeObservationPort } from './a2a-runtime-observability.ts'
import type { A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'
import type { SpecialistQualificationDecision, SpecialistQualificationPort } from './cos-specialist-orchestrator.ts'
import type { SpecialistMeshSignalPort } from './specialist-mesh-router.ts'

export const SPECIALIST_MESH_LIVE_FAILOVER_ACCEPTANCE_VERSION = 'signalboost-specialist-mesh-live-failover-acceptance-v1' as const

export interface SpecialistMeshLiveFailoverCandidate {
  agentId: string
  fetchAgentCard: () => Promise<unknown>
}

export interface SpecialistMeshLiveFailoverAcceptanceRecord {
  schemaVersion: typeof SPECIALIST_MESH_LIVE_FAILOVER_ACCEPTANCE_VERSION
  acceptedAt: string
  tenantId: string
  environmentId: string
  portableId: string
  familyId: A2ASpecialistFamilyId
  skillId: string
  traceId: string
  primaryAgentId: string
  fallbackAgentId: string
  primaryQualificationEvidenceFingerprint: string
  fallbackQualificationEvidenceFingerprint: string
  attemptedAgentIds: readonly [string, string]
  primaryMode: 'a2a_transport_unavailable'
  fallbackMode: 'delegated'
  primaryObservationEventId: string
  fallbackObservationEventId: string
  primaryDurationMs: number
  fallbackDurationMs: number
  bothTransportsAttempted: true
  noBroadcastObserved: true
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Specialist Mesh failover acceptance ${name} is required`)
  if (normalized === '*') throw new Error(`Specialist Mesh failover acceptance ${name} does not allow wildcard scope`)
  return normalized
}

function qualificationEvidence(decision: SpecialistQualificationDecision | undefined, agentId: string): string {
  if (decision?.qualified !== true) throw new Error(`specialist_mesh_failover_candidate_unqualified:${agentId}`)
  return required(decision.evidenceRef, `qualification evidenceRef for ${agentId}`)
}

function evidenceFingerprint(evidenceRef: string): string {
  return `sha256:${createHash('sha256').update(evidenceRef, 'utf8').digest('hex')}`
}

function pinnedQualificationPort(input: {
  tenantId: string
  environmentId: string
  portableId: string
  skillId: string
  primaryAgentId: string
  fallbackAgentId: string
  primaryEvidenceRef: string
  fallbackEvidenceRef: string
}): SpecialistQualificationPort {
  const expectedAgentIds = [input.primaryAgentId, input.fallbackAgentId].sort()
  const decisions = Object.freeze({
    [input.primaryAgentId]: Object.freeze({ qualified: true, evidenceRef: input.primaryEvidenceRef }),
    [input.fallbackAgentId]: Object.freeze({ qualified: true, evidenceRef: input.fallbackEvidenceRef }),
  })
  return Object.freeze({
    async snapshot(request) {
      const requestedAgentIds = [...request.agentIds].sort()
      if (
        request.tenantId !== input.tenantId
        || request.environmentId !== input.environmentId
        || request.portableId !== input.portableId
        || request.skillId !== input.skillId
        || requestedAgentIds.length !== expectedAgentIds.length
        || requestedAgentIds.some((agentId, index) => agentId !== expectedAgentIds[index])
      ) return Object.freeze({})
      return decisions
    },
  })
}

/**
 * Prove one bounded advisory failover across exactly two independently qualified specialists.
 * This is an acceptance harness, not an authority source: it consumes an existing exact registry,
 * qualification evidence, routing telemetry, Agent Cards, and host transport factory. It never
 * fabricates qualification, assignment, telemetry, endpoint credentials, or a recoverable failure.
 */
export async function runSpecialistMeshLiveFailoverAcceptance(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  qualifications: SpecialistQualificationPort
  meshSignals?: SpecialistMeshSignalPort
  primary: SpecialistMeshLiveFailoverCandidate
  fallback: SpecialistMeshLiveFailoverCandidate
  tenantId: string
  environmentId: string
  portableId: string
  familyId: A2ASpecialistFamilyId
  skillId: string
  messageText: string
  messageId: string
  traceId: string
  externalObserver?: A2ARuntimeObservationPort
  timeoutMs?: number
  now?: () => Date
}): Promise<SpecialistMeshLiveFailoverAcceptanceRecord> {
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')
  const skillId = required(options.skillId, 'skillId')
  const messageText = required(options.messageText, 'messageText')
  const messageId = required(options.messageId, 'messageId')
  const traceId = required(options.traceId, 'traceId')
  const primaryAgentId = required(options.primary.agentId, 'primary.agentId')
  const fallbackAgentId = required(options.fallback.agentId, 'fallback.agentId')
  if (primaryAgentId === fallbackAgentId) throw new Error('specialist_mesh_failover_distinct_agents_required')

  const cards = await Promise.all([
    options.primary.fetchAgentCard().then(validateA2AAgentCard),
    options.fallback.fetchAgentCard().then(validateA2AAgentCard),
  ])
  for (const [index, card] of cards.entries()) {
    const agentId = index === 0 ? primaryAgentId : fallbackAgentId
    const preferred = String(card.preferredTransport ?? 'JSONRPC').toUpperCase()
    if (preferred !== 'JSONRPC') throw new Error(`specialist_mesh_failover_transport_unsupported:${agentId}:${preferred}`)
    if (!card.skills.some(skill => skill.id === skillId)) throw new Error(`specialist_mesh_failover_skill_not_advertised:${agentId}:${skillId}`)
  }

  const snapshot = await options.registry.snapshot()
  if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')
  const expectedAgentIds = [primaryAgentId, fallbackAgentId]
  const enabledAgents = new Map(snapshot.agents.filter(agent => agent.enabled).map(agent => [agent.agentId, agent] as const))
  const exactAssignments = snapshot.assignments.filter(assignment =>
    assignment.enabled && assignment.tenantId === tenantId && assignment.environmentId === environmentId && assignment.portableId === portableId &&
    assignment.allowedSkills.some(skill => skill.skillId === skillId),
  )
  const exactCandidates = exactAssignments.filter(assignment => {
    const agent = enabledAgents.get(assignment.agentId)
    return Boolean(agent?.advertisedSkillIds.includes(skillId))
  })
  const exactCandidateIds = [...new Set(exactCandidates.map(assignment => assignment.agentId))].sort()
  const expectedSorted = [...expectedAgentIds].sort()
  if (exactCandidateIds.length !== 2 || exactCandidateIds.some((agentId, index) => agentId !== expectedSorted[index])) {
    throw new Error(`specialist_mesh_failover_exact_two_candidates_required:${exactCandidateIds.join(',') || 'none'}`)
  }
  for (const assignment of exactCandidates) {
    const configured = assignment.allowedSkills.find(skill => skill.skillId === skillId)
    if (configured?.risk !== 'advisory') throw new Error(`specialist_mesh_failover_advisory_only:${assignment.agentId}:${configured?.risk ?? 'missing'}`)
  }

  const qualificationSnapshot = await options.qualifications.snapshot({
    tenantId, environmentId, portableId, skillId, agentIds: Object.freeze([...expectedAgentIds]),
  })
  const primaryEvidenceRef = qualificationEvidence(qualificationSnapshot[primaryAgentId], primaryAgentId)
  const fallbackEvidenceRef = qualificationEvidence(qualificationSnapshot[fallbackAgentId], fallbackAgentId)
  if (primaryEvidenceRef === fallbackEvidenceRef) throw new Error('specialist_mesh_failover_independent_qualification_evidence_required')
  const qualifications = pinnedQualificationPort({
    tenantId,
    environmentId,
    portableId,
    skillId,
    primaryAgentId,
    fallbackAgentId,
    primaryEvidenceRef,
    fallbackEvidenceRef,
  })

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
    qualifications,
    meshSignals: options.meshSignals,
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
    plan: { familyId: options.familyId, skillId },
  })
  if (!result.ok || result.mode !== 'delegated') throw new Error(`specialist_mesh_failover_delegation_failed:${result.mode || 'unknown'}`)
  if (result.routingMode !== 'automatic_mesh') throw new Error(`specialist_mesh_failover_automatic_routing_required:${result.routingMode || 'missing'}`)
  if (result.selectedAgentId !== fallbackAgentId) throw new Error(`specialist_mesh_failover_wrong_fallback:${result.selectedAgentId || 'missing'}`)
  if (!result.meshAttemptedAgentIds || result.meshAttemptedAgentIds.length !== 2 || result.meshAttemptedAgentIds[0] !== primaryAgentId || result.meshAttemptedAgentIds[1] !== fallbackAgentId) {
    throw new Error(`specialist_mesh_failover_attempt_order_mismatch:${result.meshAttemptedAgentIds?.join(',') || 'none'}`)
  }

  const observed = memory.snapshot().filter(event => event.traceId === traceId && event.skillId === skillId)
  if (observed.length !== 2) throw new Error(`specialist_mesh_failover_exact_two_observations_required:${observed.length}`)
  const primaryEvent = observed.find(event => event.agentId === primaryAgentId)
  const fallbackEvent = observed.find(event => event.agentId === fallbackAgentId)
  if (!primaryEvent || primaryEvent.ok || primaryEvent.mode !== 'a2a_transport_unavailable' || primaryEvent.executionAttempted !== true) {
    throw new Error('specialist_mesh_failover_primary_transport_evidence_missing')
  }
  if (!fallbackEvent || !fallbackEvent.ok || fallbackEvent.mode !== 'delegated' || fallbackEvent.executionAttempted !== true) {
    throw new Error('specialist_mesh_failover_fallback_transport_evidence_missing')
  }

  return Object.freeze({
    schemaVersion: SPECIALIST_MESH_LIVE_FAILOVER_ACCEPTANCE_VERSION,
    acceptedAt: fallbackEvent.occurredAt,
    tenantId,
    environmentId,
    portableId,
    familyId: options.familyId,
    skillId,
    traceId,
    primaryAgentId,
    fallbackAgentId,
    primaryQualificationEvidenceFingerprint: evidenceFingerprint(primaryEvidenceRef),
    fallbackQualificationEvidenceFingerprint: evidenceFingerprint(fallbackEvidenceRef),
    attemptedAgentIds: Object.freeze([primaryAgentId, fallbackAgentId]) as readonly [string, string],
    primaryMode: 'a2a_transport_unavailable',
    fallbackMode: 'delegated',
    primaryObservationEventId: primaryEvent.eventId,
    fallbackObservationEventId: fallbackEvent.eventId,
    primaryDurationMs: primaryEvent.durationMs,
    fallbackDurationMs: fallbackEvent.durationMs,
    bothTransportsAttempted: true,
    noBroadcastObserved: true,
  })
}
