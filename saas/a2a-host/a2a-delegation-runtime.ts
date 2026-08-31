import { createA2AClient, type A2AScope } from '../a2a-core/a2a-client.ts'
import {
  A2A_AGENT_REGISTRY_VERSION,
  type A2AAgentRegistryPort,
  type A2ADelegationRisk,
  type A2ATransportFactory,
} from './a2a-agent-registry.ts'
import {
  A2A_RUNTIME_OBSERVATION_VERSION,
  type A2ARuntimeObservationPort,
} from './a2a-runtime-observability.ts'

export const A2A_DELEGATION_RUNTIME_VERSION = 'signalboost-a2a-delegation-runtime-v1' as const

export interface A2AApprovalEvidence {
  approvalId: string
  approvedBy: string
  approvedAt: string
}

export interface A2ADelegationInvocation {
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  skillId: string
  messageId: string
  text: string
  contextId?: string
  taskId?: string
  traceId?: string
  actor?: A2AScope['actor']
  approval?: A2AApprovalEvidence
}

export interface A2ADelegationResult {
  ok: boolean
  agentId: string
  skillId: string
  risk?: A2ADelegationRisk
  data?: Readonly<Record<string, unknown>>
  mode?: string
  error?: string
}

export interface A2ADelegationAuditEvent {
  schemaVersion: typeof A2A_DELEGATION_RUNTIME_VERSION
  eventId: string
  occurredAt: string
  tenantId: string
  environmentId: string
  portableId: string
  assignmentId: string
  agentId: string
  skillId: string
  risk: A2ADelegationRisk
  approvalId?: string
  ok: boolean
  mode?: string
  error?: string
  traceId?: string
}

export interface A2ADelegationAuditPort {
  append(event: A2ADelegationAuditEvent): Promise<void>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A delegation ${name} is required`)
  if (normalized === '*') throw new Error(`A2A delegation ${name} does not allow wildcard scope`)
  return normalized
}

function validateApproval(value: A2AApprovalEvidence | undefined): A2AApprovalEvidence | null {
  if (!value) return null
  const approvedAt = new Date(required(value.approvedAt, 'approval.approvedAt'))
  if (!Number.isFinite(approvedAt.getTime())) throw new Error('a2a_approval_timestamp_invalid')
  return Object.freeze({
    approvalId: required(value.approvalId, 'approval.approvalId'),
    approvedBy: required(value.approvedBy, 'approval.approvedBy'),
    approvedAt: approvedAt.toISOString(),
  })
}

function randomId(): string {
  const cryptoLike = globalThis.crypto
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID()
  return `a2a_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createA2ADelegationRuntime(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  audit?: A2ADelegationAuditPort
  observe?: A2ARuntimeObservationPort
  requireAuditForConsequential?: boolean
  timeoutMs?: number
  createId?: () => string
  now?: () => Date
}) {
  const requireAuditForConsequential = options.requireAuditForConsequential ?? true
  const createId = options.createId ?? randomId
  const now = options.now ?? (() => new Date())

  async function appendAudit(input: {
    invocation: A2ADelegationInvocation
    assignmentId: string
    risk: A2ADelegationRisk
    approval: A2AApprovalEvidence | null
    result: A2ADelegationResult
  }): Promise<void> {
    if (!options.audit) return
    await options.audit.append(Object.freeze({
      schemaVersion: A2A_DELEGATION_RUNTIME_VERSION,
      eventId: createId(),
      occurredAt: now().toISOString(),
      tenantId: input.invocation.tenantId,
      environmentId: input.invocation.environmentId,
      portableId: input.invocation.portableId,
      assignmentId: input.assignmentId,
      agentId: input.invocation.agentId,
      skillId: input.invocation.skillId,
      risk: input.risk,
      approvalId: input.approval?.approvalId,
      ok: input.result.ok,
      mode: input.result.mode,
      error: input.result.error,
      traceId: input.invocation.traceId,
    }))
  }

  async function appendObservation(input: {
    invocation: A2ADelegationInvocation
    startedAtMs: number
    result: A2ADelegationResult
    assignmentId?: string
    transportRef?: string
    risk?: A2ADelegationRisk
    approval?: A2AApprovalEvidence | null
  }): Promise<void> {
    if (!options.observe) return
    const endedAt = now()
    try {
      await options.observe.append(Object.freeze({
        schemaVersion: A2A_RUNTIME_OBSERVATION_VERSION,
        eventId: createId(),
        occurredAt: endedAt.toISOString(),
        durationMs: Math.max(0, endedAt.getTime() - input.startedAtMs),
        tenantId: input.invocation.tenantId,
        environmentId: input.invocation.environmentId,
        portableId: input.invocation.portableId,
        agentId: input.invocation.agentId,
        skillId: input.invocation.skillId,
        assignmentId: input.assignmentId,
        transportRef: input.transportRef,
        risk: input.risk,
        approvalId: input.approval?.approvalId,
        traceId: input.invocation.traceId,
        ok: input.result.ok,
        mode: input.result.mode || (input.result.ok ? 'delegated' : 'blocked'),
        errorCode: input.result.ok ? undefined : (input.result.mode || 'a2a_failed'),
      }))
    } catch {
      // Observability is metadata evidence, never execution authority.
    }
  }

  async function invoke(raw: A2ADelegationInvocation): Promise<A2ADelegationResult> {
    const startedAtMs = now().getTime()
    const invocation: A2ADelegationInvocation = Object.freeze({
      ...raw,
      tenantId: required(raw.tenantId, 'tenantId'),
      environmentId: required(raw.environmentId, 'environmentId'),
      portableId: required(raw.portableId, 'portableId'),
      agentId: required(raw.agentId, 'agentId'),
      skillId: required(raw.skillId, 'skillId'),
      messageId: required(raw.messageId, 'messageId'),
      text: required(raw.text, 'text'),
    })
    const snapshot = await options.registry.snapshot()
    if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')

    const agent = snapshot.agents.find(item => item.enabled && item.agentId === invocation.agentId)
    const assignment = snapshot.assignments.find(item =>
      item.enabled && item.agentId === invocation.agentId && item.tenantId === invocation.tenantId &&
      item.environmentId === invocation.environmentId && item.portableId === invocation.portableId,
    )
    if (!agent || !assignment) {
      const result = Object.freeze({ ok: false, agentId: invocation.agentId, skillId: invocation.skillId, mode: 'agent_unavailable', error: invocation.agentId })
      await appendObservation({ invocation, startedAtMs, result, transportRef: agent?.transportRef })
      return result
    }

    const skill = assignment.allowedSkills.find(item => item.skillId === invocation.skillId)
    if (!skill) {
      const result = Object.freeze({ ok: false, agentId: invocation.agentId, skillId: invocation.skillId, mode: 'skill_not_authorized', error: invocation.skillId })
      await appendObservation({ invocation, startedAtMs, result, assignmentId: assignment.assignmentId, transportRef: agent.transportRef })
      return result
    }

    const approval = validateApproval(invocation.approval)
    if (skill.risk !== 'advisory' && !approval) {
      const result = Object.freeze({ ok: false, agentId: invocation.agentId, skillId: invocation.skillId, risk: skill.risk, mode: 'approval_required', error: invocation.skillId })
      await appendObservation({ invocation, startedAtMs, result, assignmentId: assignment.assignmentId, transportRef: agent.transportRef, risk: skill.risk, approval })
      await appendAudit({ invocation, assignmentId: assignment.assignmentId, risk: skill.risk, approval, result })
      return result
    }
    if (skill.risk === 'consequential' && requireAuditForConsequential && !options.audit) {
      const result = Object.freeze({
        ok: false,
        agentId: invocation.agentId,
        skillId: invocation.skillId,
        risk: skill.risk,
        mode: 'audit_required',
        error: 'consequential A2A delegation requires a buyer-controlled audit sink',
      })
      await appendObservation({ invocation, startedAtMs, result, assignmentId: assignment.assignmentId, transportRef: agent.transportRef, risk: skill.risk, approval })
      return result
    }

    const scope: A2AScope = Object.freeze({
      tenantId: invocation.tenantId,
      environmentId: invocation.environmentId,
      portableId: invocation.portableId,
      ...(invocation.actor ? { actor: invocation.actor } : {}),
    })

    let result: A2ADelegationResult
    try {
      const transport = options.transportFactory.create({ agentId: agent.agentId, transportRef: agent.transportRef, scope })
      const client = createA2AClient({ agentId: agent.agentId, transportRef: agent.transportRef, scope, transport, timeoutMs: options.timeoutMs })
      const data = await client.sendMessage({
        messageId: invocation.messageId,
        text: invocation.text,
        contextId: invocation.contextId,
        taskId: invocation.taskId,
        metadata: Object.freeze({
          signalboostSkillId: invocation.skillId,
          signalboostRisk: skill.risk,
          ...(approval ? { signalboostApprovalId: approval.approvalId } : {}),
        }),
      })
      result = Object.freeze({ ok: true, agentId: invocation.agentId, skillId: invocation.skillId, risk: skill.risk, data, mode: 'delegated' })
    } catch (error) {
      result = Object.freeze({
        ok: false,
        agentId: invocation.agentId,
        skillId: invocation.skillId,
        risk: skill.risk,
        mode: 'a2a_runtime_error',
        error: error instanceof Error ? error.message : 'A2A delegation failed',
      })
    }

    await appendObservation({ invocation, startedAtMs, result, assignmentId: assignment.assignmentId, transportRef: agent.transportRef, risk: skill.risk, approval })
    await appendAudit({ invocation, assignmentId: assignment.assignmentId, risk: skill.risk, approval, result })
    return result
  }

  return Object.freeze({ invoke })
}
