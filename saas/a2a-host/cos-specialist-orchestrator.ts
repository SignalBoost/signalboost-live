import { A2A_AGENT_REGISTRY_VERSION, type A2AAgentRegistryPort } from './a2a-agent-registry.ts'
import type { A2AApprovalEvidence, A2ADelegationInvocation, A2ADelegationResult } from './a2a-delegation-runtime.ts'
import { getA2ASpecialistFamily, type A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'
import { isRecoverableMeshDelegationFailure, rankSpecialistMeshCandidates, type SpecialistMeshSignalPort } from './specialist-mesh-router.ts'

export const COS_SPECIALIST_ORCHESTRATOR_VERSION = 'signalboost-cos-specialist-orchestrator-v4' as const

export interface COSSpecialistPlan {
  familyId: A2ASpecialistFamilyId
  skillId: string
  /** Optional exact governed agent choice. If omitted, the specialist mesh selects an eligible worker. */
  agentId?: string
}

export interface COSSpecialistOrchestrationInput {
  tenantId: string
  environmentId: string
  portableId: string
  messageId: string
  text: string
  plan: COSSpecialistPlan
  contextId?: string
  taskId?: string
  traceId?: string
  actor?: A2ADelegationInvocation['actor']
  approval?: A2AApprovalEvidence
}

export interface COSSpecialistOrchestrationResult extends A2ADelegationResult {
  familyId: A2ASpecialistFamilyId
  selectedAgentId?: string
  meshAttemptedAgentIds?: readonly string[]
  routingMode?: 'explicit_agent' | 'automatic_mesh'
  orchestratorVersion: typeof COS_SPECIALIST_ORCHESTRATOR_VERSION
}

export interface A2ADelegationRuntimePort {
  invoke(input: A2ADelegationInvocation): Promise<A2ADelegationResult>
}

export interface SpecialistQualificationDecision {
  qualified: boolean
  /** Durable host evidence reference. Discovery metadata or assignment authorization is not qualification evidence. */
  evidenceRef?: string
}

export interface SpecialistQualificationRequest {
  tenantId: string
  environmentId: string
  portableId: string
  skillId: string
  agentIds: readonly string[]
}

/**
 * Host-controlled qualification evidence. This is a hard gate, not a routing score.
 * Missing, failed, malformed, or negative evidence leaves the specialist ineligible.
 */
export interface SpecialistQualificationPort {
  snapshot(input: SpecialistQualificationRequest): Promise<Readonly<Record<string, SpecialistQualificationDecision>>>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`COS specialist orchestration ${name} is required`)
  if (normalized === '*') throw new Error(`COS specialist orchestration ${name} does not allow wildcard scope`)
  return normalized
}

function verifiedQualification(value: unknown): value is SpecialistQualificationDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const decision = value as Record<string, unknown>
  return decision.qualified === true && typeof decision.evidenceRef === 'string' && decision.evidenceRef.trim().length > 0
}

export function createCOSSpecialistOrchestrator(options: {
  registry: A2AAgentRegistryPort
  delegation: A2ADelegationRuntimePort
  qualifications?: SpecialistQualificationPort
  meshSignals?: SpecialistMeshSignalPort
}) {
  return Object.freeze({
    async orchestrate(raw: COSSpecialistOrchestrationInput): Promise<COSSpecialistOrchestrationResult> {
      const tenantId = required(raw.tenantId, 'tenantId')
      const environmentId = required(raw.environmentId, 'environmentId')
      const portableId = required(raw.portableId, 'portableId')
      const messageId = required(raw.messageId, 'messageId')
      const text = required(raw.text, 'text')
      const family = getA2ASpecialistFamily(raw.plan.familyId)
      const skillId = required(raw.plan.skillId, 'plan.skillId')
      const canonicalSkill = family.skills.find(skill => skill.skillId === skillId)
      if (!canonicalSkill) {
        return Object.freeze({ ok: false, agentId: raw.plan.agentId ? required(raw.plan.agentId, 'plan.agentId') : 'unresolved', skillId, familyId: family.familyId, orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION, mode: 'specialist_skill_not_in_family', error: skillId })
      }

      const snapshot = await options.registry.snapshot()
      if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')
      const enabledAgents = new Map(snapshot.agents.filter(agent => agent.enabled).map(agent => [agent.agentId, agent] as const))
      const requestedAgentId = raw.plan.agentId === undefined ? undefined : required(raw.plan.agentId, 'plan.agentId')
      const exactAssignments = snapshot.assignments.filter(assignment => assignment.enabled && assignment.tenantId === tenantId && assignment.environmentId === environmentId && assignment.portableId === portableId && (!requestedAgentId || assignment.agentId === requestedAgentId))
      const skillAssignments = exactAssignments.filter(assignment => assignment.allowedSkills.some(skill => skill.skillId === skillId))

      for (const assignment of skillAssignments) {
        const configured = assignment.allowedSkills.find(skill => skill.skillId === skillId)!
        if (configured.risk !== canonicalSkill.risk) {
          return Object.freeze({ ok: false, agentId: assignment.agentId, skillId, familyId: family.familyId, selectedAgentId: assignment.agentId, orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION, mode: 'specialist_risk_mismatch', error: `${configured.risk}:${canonicalSkill.risk}` })
        }
      }

      const advertisedCandidates = skillAssignments.flatMap(assignment => {
        const agent = enabledAgents.get(assignment.agentId)
        return agent && agent.advertisedSkillIds.includes(skillId) ? [{ assignment, agent }] : []
      })
      if (advertisedCandidates.length === 0) {
        return Object.freeze({ ok: false, agentId: requestedAgentId ?? 'unresolved', skillId, familyId: family.familyId, orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION, mode: 'specialist_unavailable', error: requestedAgentId ?? skillId })
      }

      let qualificationEvidence: Readonly<Record<string, SpecialistQualificationDecision>> = {}
      if (options.qualifications) {
        try {
          qualificationEvidence = await options.qualifications.snapshot({
            tenantId, environmentId, portableId, skillId,
            agentIds: Object.freeze(advertisedCandidates.map(candidate => candidate.agent.agentId)),
          })
        } catch {
          qualificationEvidence = {}
        }
      }
      const candidates = advertisedCandidates.filter(candidate => verifiedQualification(qualificationEvidence[candidate.agent.agentId]))
      if (candidates.length === 0) {
        return Object.freeze({ ok: false, agentId: requestedAgentId ?? 'unresolved', skillId, familyId: family.familyId, selectedAgentId: requestedAgentId, orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION, mode: 'specialist_unqualified', error: requestedAgentId ?? skillId })
      }

      let liveSignals = {}
      if (!requestedAgentId && options.meshSignals) {
        try {
          liveSignals = await options.meshSignals.snapshot({ tenantId, environmentId, portableId, skillId, agentIds: Object.freeze(candidates.map(candidate => candidate.agent.agentId)) })
        } catch {
          // Telemetry is advisory routing evidence, never an execution dependency or authority source.
          liveSignals = {}
        }
      }
      const ranked = requestedAgentId
        ? candidates.map(candidate => ({ agentId: candidate.agent.agentId, metadata: candidate.agent.metadata, meshScore: 0 }))
        : rankSpecialistMeshCandidates(candidates.map(candidate => ({ agentId: candidate.agent.agentId, metadata: candidate.agent.metadata })), liveSignals)

      if (ranked.length === 0) {
        return Object.freeze({ ok: false, agentId: requestedAgentId ?? 'unresolved', skillId, familyId: family.familyId, orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION, mode: 'specialist_unavailable', error: 'mesh_no_available_candidate' })
      }

      const attempted: string[] = []
      let last: A2ADelegationResult | undefined
      for (const selected of ranked) {
        attempted.push(selected.agentId)
        const delegated = await options.delegation.invoke({ tenantId, environmentId, portableId, agentId: selected.agentId, skillId, messageId, text, contextId: raw.contextId, taskId: raw.taskId, traceId: raw.traceId, actor: raw.actor, approval: raw.approval })
        last = delegated
        if (delegated.ok || requestedAgentId || canonicalSkill.risk !== 'advisory' || !isRecoverableMeshDelegationFailure(delegated.mode)) {
          return Object.freeze({ ...delegated, familyId: family.familyId, selectedAgentId: selected.agentId, meshAttemptedAgentIds: Object.freeze([...attempted]), routingMode: requestedAgentId ? 'explicit_agent' : 'automatic_mesh', orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION })
        }
      }

      return Object.freeze({ ...(last ?? { ok: false, agentId: 'unresolved', skillId, mode: 'specialist_unavailable', error: skillId }), familyId: family.familyId, selectedAgentId: attempted.at(-1), meshAttemptedAgentIds: Object.freeze([...attempted]), routingMode: requestedAgentId ? 'explicit_agent' : 'automatic_mesh', orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION })
    },
  })
}
