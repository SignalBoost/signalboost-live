import { createA2AClient, type A2AClient, type A2AScope, type A2ATransport } from '../a2a-core/a2a-client.ts'

export const A2A_AGENT_REGISTRY_VERSION = 'signalboost-a2a-agent-registry-v1' as const

export type A2ADelegationRisk = 'advisory' | 'write' | 'consequential'

export interface RegisteredA2AAgent {
  agentId: string
  displayName: string
  description: string
  transportRef: string
  enabled: boolean
  advertisedSkillIds: readonly string[]
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface A2AAgentAssignment {
  assignmentId: string
  agentId: string
  tenantId: string
  environmentId: string
  portableId: string
  enabled: boolean
  allowedSkills: readonly {
    skillId: string
    risk: A2ADelegationRisk
  }[]
}

export interface A2AAgentRegistrySnapshot {
  schemaVersion: typeof A2A_AGENT_REGISTRY_VERSION
  agents: readonly RegisteredA2AAgent[]
  assignments: readonly A2AAgentAssignment[]
}

export interface A2AAgentRegistryPort {
  snapshot(): Promise<A2AAgentRegistrySnapshot>
}

export interface A2ATransportFactory {
  create(input: {
    agentId: string
    transportRef: string
    scope: A2AScope
  }): A2ATransport
}

export interface ResolvedA2AAgent {
  assignmentId: string
  agentId: string
  displayName: string
  client: A2AClient
  allowedSkillIds: readonly string[]
  sendAdvisory(input: {
    skillId: string
    messageId: string
    text: string
    contextId?: string
    taskId?: string
  }): Promise<Readonly<Record<string, unknown>>>
}

const SECRET_KEY = /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|authorization|credential)/i

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A registry ${name} is required`)
  if (normalized === '*') throw new Error(`A2A registry ${name} does not allow wildcard scope`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateSafeMetadata(value: unknown, path: string): void {
  if (value === undefined) return
  if (!plain(value)) throw new Error(`A2A registry ${path} must be a plain object`)
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`a2a_registry_secret_field_rejected:${path}.${key}`)
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new Error(`A2A registry ${path}.${key} must be scalar`)
    }
  }
}

function uniqueStrings(values: readonly string[], name: string): readonly string[] {
  const normalized = values.map(value => required(value, name))
  if (!normalized.length) throw new Error(`A2A registry ${name} must not be empty`)
  const unique = [...new Set(normalized)]
  if (unique.length !== normalized.length) throw new Error(`a2a_registry_duplicate_${name.replace(/[^a-z0-9]+/gi, '_')}`)
  return Object.freeze(unique)
}

function normalizeAgent(agent: RegisteredA2AAgent): RegisteredA2AAgent {
  validateSafeMetadata(agent.metadata, 'agent.metadata')
  return Object.freeze({
    agentId: required(agent.agentId, 'agentId'),
    displayName: required(agent.displayName, 'agent.displayName'),
    description: required(agent.description, 'agent.description'),
    transportRef: required(agent.transportRef, 'agent.transportRef'),
    enabled: agent.enabled === true,
    advertisedSkillIds: uniqueStrings(agent.advertisedSkillIds, 'agentSkillId'),
    metadata: agent.metadata ? Object.freeze({ ...agent.metadata }) : undefined,
  })
}

function normalizeAssignment(assignment: A2AAgentAssignment): A2AAgentAssignment {
  const allowedSkills = assignment.allowedSkills.map(item => {
    const skillId = required(item.skillId, 'assignment.skillId')
    if (!['advisory', 'write', 'consequential'].includes(item.risk)) throw new Error('a2a_registry_skill_risk_invalid')
    return Object.freeze({ skillId, risk: item.risk })
  })
  if (!allowedSkills.length) throw new Error('a2a_registry_assignment_skills_required')
  const skillIds = allowedSkills.map(item => item.skillId)
  if (new Set(skillIds).size !== skillIds.length) throw new Error('a2a_registry_duplicate_allowed_skill')
  return Object.freeze({
    assignmentId: required(assignment.assignmentId, 'assignmentId'),
    agentId: required(assignment.agentId, 'assignment.agentId'),
    tenantId: required(assignment.tenantId, 'assignment.tenantId'),
    environmentId: required(assignment.environmentId, 'assignment.environmentId'),
    portableId: required(assignment.portableId, 'assignment.portableId'),
    enabled: assignment.enabled === true,
    allowedSkills: Object.freeze(allowedSkills),
  })
}

export function normalizeA2AAgentRegistrySnapshot(input: Omit<A2AAgentRegistrySnapshot, 'schemaVersion'>): A2AAgentRegistrySnapshot {
  const agents = input.agents.map(normalizeAgent)
  const assignments = input.assignments.map(normalizeAssignment)
  const agentIds = new Set<string>()
  const assignmentIds = new Set<string>()
  const scopeAgentKeys = new Set<string>()

  for (const agent of agents) {
    if (agentIds.has(agent.agentId)) throw new Error(`a2a_registry_duplicate_agent:${agent.agentId}`)
    agentIds.add(agent.agentId)
  }
  for (const assignment of assignments) {
    if (assignmentIds.has(assignment.assignmentId)) throw new Error(`a2a_registry_duplicate_assignment:${assignment.assignmentId}`)
    assignmentIds.add(assignment.assignmentId)
    const agent = agents.find(item => item.agentId === assignment.agentId)
    if (!agent) throw new Error(`a2a_registry_unknown_agent:${assignment.agentId}`)
    const advertised = new Set(agent.advertisedSkillIds)
    for (const skill of assignment.allowedSkills) {
      if (!advertised.has(skill.skillId)) throw new Error(`a2a_registry_unadvertised_skill:${skill.skillId}`)
    }
    const key = `${assignment.tenantId}\u0000${assignment.environmentId}\u0000${assignment.portableId}\u0000${assignment.agentId}`
    if (scopeAgentKeys.has(key)) throw new Error(`a2a_registry_duplicate_scope_agent_assignment:${assignment.assignmentId}`)
    scopeAgentKeys.add(key)
  }

  return Object.freeze({
    schemaVersion: A2A_AGENT_REGISTRY_VERSION,
    agents: Object.freeze(agents),
    assignments: Object.freeze(assignments),
  })
}

export function createInMemoryA2AAgentRegistry(input: Omit<A2AAgentRegistrySnapshot, 'schemaVersion'>): A2AAgentRegistryPort {
  const snapshot = normalizeA2AAgentRegistrySnapshot(input)
  return Object.freeze({ async snapshot() { return snapshot } })
}

export function createA2AAgentResolver(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  timeoutMs?: number
}) {
  return Object.freeze({
    async resolve(input: {
      tenantId: string
      environmentId: string
      portableId: string
      agentId: string
      actor?: A2AScope['actor']
    }): Promise<ResolvedA2AAgent | null> {
      const tenantId = required(input.tenantId, 'tenantId')
      const environmentId = required(input.environmentId, 'environmentId')
      const portableId = required(input.portableId, 'portableId')
      const agentId = required(input.agentId, 'agentId')
      const snapshot = await options.registry.snapshot()
      if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')
      const agent = snapshot.agents.find(item => item.agentId === agentId && item.enabled)
      if (!agent) return null
      const assignment = snapshot.assignments.find(item =>
        item.enabled && item.agentId === agentId && item.tenantId === tenantId &&
        item.environmentId === environmentId && item.portableId === portableId,
      )
      if (!assignment) return null

      const scope: A2AScope = Object.freeze({ tenantId, environmentId, portableId, ...(input.actor ? { actor: input.actor } : {}) })
      const transport = options.transportFactory.create({ agentId, transportRef: agent.transportRef, scope })
      const client = createA2AClient({ agentId, transportRef: agent.transportRef, scope, transport, timeoutMs: options.timeoutMs })
      const allowed = new Map(assignment.allowedSkills.map(skill => [skill.skillId, skill] as const))

      return Object.freeze({
        assignmentId: assignment.assignmentId,
        agentId,
        displayName: agent.displayName,
        client,
        allowedSkillIds: Object.freeze([...allowed.keys()]),
        async sendAdvisory(message) {
          const skillId = required(message.skillId, 'skillId')
          const skill = allowed.get(skillId)
          if (!skill) throw new Error(`a2a_skill_not_authorized:${skillId}`)
          if (skill.risk !== 'advisory') throw new Error(`a2a_phase1_non_advisory_delegation_blocked:${skillId}`)
          return client.sendMessage({
            messageId: message.messageId,
            text: message.text,
            contextId: message.contextId,
            taskId: message.taskId,
            metadata: Object.freeze({ signalboostSkillId: skillId }),
          })
        },
      })
    },
  })
}
