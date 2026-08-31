import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'
import {
  normalizeA2AAgentRegistrySnapshot,
  type A2AAgentAssignment,
  type A2ADelegationRisk,
  type RegisteredA2AAgent,
} from './a2a-agent-registry.ts'
import { probeA2AAvailability, type A2AAvailabilityEvidence } from './a2a-availability.ts'

export const A2A_BUYER_ONBOARDING_VERSION = 'signalboost-a2a-buyer-onboarding-v1' as const

export type BuyerA2AApprovedSkill = Readonly<{
  skillId: string
  risk: A2ADelegationRisk
}>

export type BuyerA2AOnboardingResult = Readonly<{
  status: 'buyer-ready'
  agent: RegisteredA2AAgent
  assignment: A2AAgentAssignment
  health: readonly A2AAvailabilityEvidence[]
}>

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A buyer onboarding ${name} is required`)
  if (normalized === '*') throw new Error(`A2A buyer onboarding ${name} does not allow wildcard scope`)
  return normalized
}

function normalizeApprovals(values: readonly BuyerA2AApprovedSkill[]): readonly BuyerA2AApprovedSkill[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error('a2a_buyer_onboarding_approved_skills_required')
  const seen = new Set<string>()
  return Object.freeze(values.map(item => {
    const skillId = required(item.skillId, 'skillId')
    if (seen.has(skillId)) throw new Error(`a2a_buyer_onboarding_duplicate_skill:${skillId}`)
    seen.add(skillId)
    if (!['advisory', 'write', 'consequential'].includes(item.risk)) throw new Error(`a2a_buyer_onboarding_invalid_risk:${skillId}`)
    return Object.freeze({ skillId, risk: item.risk })
  }))
}

/**
 * Compile a buyer-owned A2A specialist into existing SignalBoost registry records.
 * Agent Card data is discovery-only; governance supplies exact scope and risk.
 * Endpoint/auth stay in the buyer host. Only logical transportRef is persisted.
 */
export async function compileBuyerA2AOnboarding(input: {
  agentCard: unknown
  fetchAgentCardForHealth: () => Promise<unknown>
  agentId: string
  transportRef: string
  assignmentId: string
  tenantId: string
  environmentId: string
  portableId: string
  approvedSkills: readonly BuyerA2AApprovedSkill[]
}): Promise<BuyerA2AOnboardingResult> {
  const agentId = required(input.agentId, 'agentId')
  const transportRef = required(input.transportRef, 'transportRef')
  const assignmentId = required(input.assignmentId, 'assignmentId')
  const tenantId = required(input.tenantId, 'tenantId')
  const environmentId = required(input.environmentId, 'environmentId')
  const portableId = required(input.portableId, 'portableId')
  const approvedSkills = normalizeApprovals(input.approvedSkills)
  const card = validateA2AAgentCard(input.agentCard)
  const advertised = new Set(card.skills.map(skill => skill.id))

  for (const approval of approvedSkills) {
    if (!advertised.has(approval.skillId)) throw new Error(`a2a_buyer_onboarding_unadvertised_skill:${approval.skillId}`)
  }

  const health: A2AAvailabilityEvidence[] = []
  for (const approval of approvedSkills) {
    const evidence = await probeA2AAvailability({
      expectedSkillId: approval.skillId,
      fetchAgentCard: input.fetchAgentCardForHealth,
    })
    health.push(evidence)
    if (!evidence.available) throw new Error(`a2a_buyer_onboarding_health_failed:${approval.skillId}:${evidence.error || 'unavailable'}`)
  }

  const agent: RegisteredA2AAgent = {
    agentId,
    displayName: card.name,
    description: card.description,
    transportRef,
    enabled: true,
    advertisedSkillIds: Object.freeze(card.skills.map(skill => skill.id)),
    metadata: Object.freeze({
      onboarding: 'buyer-ready',
      protocolVersion: card.protocolVersion,
    }),
  }
  const assignment: A2AAgentAssignment = {
    assignmentId,
    agentId,
    tenantId,
    environmentId,
    portableId,
    enabled: true,
    allowedSkills: Object.freeze(approvedSkills.map(item => Object.freeze({ skillId: item.skillId, risk: item.risk }))),
  }

  const normalized = normalizeA2AAgentRegistrySnapshot({ agents: [agent], assignments: [assignment] })
  return Object.freeze({
    status: 'buyer-ready',
    agent: normalized.agents[0],
    assignment: normalized.assignments[0],
    health: Object.freeze(health),
  })
}
