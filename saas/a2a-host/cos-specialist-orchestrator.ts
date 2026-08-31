import { A2A_AGENT_REGISTRY_VERSION, type A2AAgentRegistryPort } from './a2a-agent-registry.ts'
import type { A2AApprovalEvidence, A2ADelegationInvocation, A2ADelegationResult } from './a2a-delegation-runtime.ts'
import { getA2ASpecialistFamily, type A2ASpecialistFamilyId } from './a2a-specialist-catalog.ts'

export const COS_SPECIALIST_ORCHESTRATOR_VERSION = 'signalboost-cos-specialist-orchestrator-v1' as const

export interface COSSpecialistPlan {
  familyId: A2ASpecialistFamilyId
  skillId: string
  /** Optional exact agent choice. If omitted, exactly one eligible assignment must exist. */
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
  orchestratorVersion: typeof COS_SPECIALIST_ORCHESTRATOR_VERSION
}

export interface A2ADelegationRuntimePort {
  invoke(input: A2ADelegationInvocation): Promise<A2ADelegationResult>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`COS specialist orchestration ${name} is required`)
  if (normalized === '*') throw new Error(`COS specialist orchestration ${name} does not allow wildcard scope`)
  return normalized
}

export function createCOSSpecialistOrchestrator(options: {
  registry: A2AAgentRegistryPort
  delegation: A2ADelegationRuntimePort
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
        return Object.freeze({
          ok: false,
          agentId: raw.plan.agentId ? required(raw.plan.agentId, 'plan.agentId') : 'unresolved',
          skillId,
          familyId: family.familyId,
          orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION,
          mode: 'specialist_skill_not_in_family',
          error: skillId,
        })
      }

      const snapshot = await options.registry.snapshot()
      if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')
      const enabledAgents = new Map(snapshot.agents.filter(agent => agent.enabled).map(agent => [agent.agentId, agent] as const))
      const requestedAgentId = raw.plan.agentId === undefined ? undefined : required(raw.plan.agentId, 'plan.agentId')

      const exactAssignments = snapshot.assignments.filter(assignment =>
        assignment.enabled && assignment.tenantId === tenantId && assignment.environmentId === environmentId &&
        assignment.portableId === portableId && (!requestedAgentId || assignment.agentId === requestedAgentId),
      )
      const skillAssignments = exactAssignments.filter(assignment => assignment.allowedSkills.some(skill => skill.skillId === skillId))

      for (const assignment of skillAssignments) {
        const configured = assignment.allowedSkills.find(skill => skill.skillId === skillId)!
        if (configured.risk !== canonicalSkill.risk) {
          return Object.freeze({
            ok: false,
            agentId: assignment.agentId,
            skillId,
            familyId: family.familyId,
            selectedAgentId: assignment.agentId,
            orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION,
            mode: 'specialist_risk_mismatch',
            error: `${configured.risk}:${canonicalSkill.risk}`,
          })
        }
      }

      const candidates = skillAssignments.filter(assignment => {
        const agent = enabledAgents.get(assignment.agentId)
        return Boolean(agent && agent.advertisedSkillIds.includes(skillId))
      })

      if (candidates.length === 0) {
        return Object.freeze({
          ok: false,
          agentId: requestedAgentId ?? 'unresolved',
          skillId,
          familyId: family.familyId,
          orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION,
          mode: 'specialist_unavailable',
          error: requestedAgentId ?? skillId,
        })
      }
      if (candidates.length > 1) {
        return Object.freeze({
          ok: false,
          agentId: 'ambiguous',
          skillId,
          familyId: family.familyId,
          orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION,
          mode: 'specialist_ambiguous',
          error: candidates.map(candidate => candidate.agentId).sort().join(','),
        })
      }

      const selected = candidates[0]!
      const delegated = await options.delegation.invoke({
        tenantId,
        environmentId,
        portableId,
        agentId: selected.agentId,
        skillId,
        messageId,
        text,
        contextId: raw.contextId,
        taskId: raw.taskId,
        traceId: raw.traceId,
        actor: raw.actor,
        approval: raw.approval,
      })

      return Object.freeze({
        ...delegated,
        familyId: family.familyId,
        selectedAgentId: selected.agentId,
        orchestratorVersion: COS_SPECIALIST_ORCHESTRATOR_VERSION,
      })
    },
  })
}
