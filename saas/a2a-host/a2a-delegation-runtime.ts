import { createA2AClient, type A2AScope, type A2ATransport } from '../a2a-core/a2a-client.ts'
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

export const A2A_DELEGATION_RUNTIME_VERSION = 'signalboost-a2a-delegation-runtime-v3' as const

export interface A2AApprovalEvidence {
  approvalId: string
  approvedBy: string
  approvedAt: string
}

/** Host-owned advisory progress only. This envelope never grants authorization, qualification, approval, or tool authority. */
export interface A2AMeshResumeCheckpoint {
  schemaVersion: 'signalboost-specialist-mesh-checkpoint-v1'
  checkpointKey: string
  sourceAgentId: string
  sourceFencingToken: number
  createdAt: string
  expiresAt: string
  state: Readonly<Record<string, unknown>>
}

/**
 * Host-owned write recovery metadata. The remote specialist must propagate this exact provider
 * idempotency key to the consequential provider. It grants no permission by itself.
 */
export interface A2AMeshWriteRecoveryEnvelope {
  schemaVersion: 'signalboost-specialist-mesh-write-recovery-v1'
  operationKey: string
  providerId: string
  idempotencyKey: string
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
  meshResume?: A2AMeshResumeCheckpoint
  meshWriteRecovery?: A2AMeshWriteRecoveryEnvelope
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

function boundedRequired(value: unknown, name: string, max: number): string {
  const normalized = required(value, name)
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`A2A delegation ${name} is invalid`)
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

function validateMeshWriteRecovery(value: A2AMeshWriteRecoveryEnvelope | undefined): A2AMeshWriteRecoveryEnvelope | undefined {
  if (!value) return undefined
  if (value.schemaVersion !== 'signalboost-specialist-mesh-write-recovery-v1') {
    throw new Error('a2a_write_recovery_schema_version_invalid')
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    operationKey: boundedRequired(value.operationKey, 'meshWriteRecovery.operationKey', 2048),
    providerId: boundedRequired(value.providerId, 'meshWriteRecovery.providerId', 256),
    idempotencyKey: boundedRequired(value.idempotencyKey, 'meshWriteRecovery.idempotencyKey', 512),
  })
}

function randomId(): string {
  const cryptoLike = globalThis.crypto
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID()
  return `a2a_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const TRANSIENT_HTTP_STATUS = /a2a_http_status_(408|425|429|500|502|503|504)$/
const NETWORK_UNAVAILABLE = /(?:fetch failed|network(?: error)?|socket hang up|econnreset|econnrefused|enotfound|eai_again|etimedout|connection reset|connection refused)/i

/**
 * Only failures that prove transport unavailability are recoverable by the specialist mesh.
 * Protocol, auth, validation, application, response-correlation, and malformed-result errors remain terminal.
 */
function delegationFailure(error: unknown): { mode: 'a2a_transport_unavailable' | 'a2a_runtime_error'; message: string } {
  const message = error instanceof Error ? error.message : 'A2A delegation failed'
  const name = error instanceof Error ? error.name : ''
  if (message === 'a2a_http_timeout' || TRANSIENT_HTTP_STATUS.test(message) || name === 'AbortError' || NETWORK_UNAVAILABLE.test(message)) {
    return { mode: 'a2a_transport_unavailable', message }
  }
  return { mode: 'a2a_runtime_error', message }
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
    executionAttempted?: boolean
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
        executionAttempted: input.executionAttempted === true,
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
    const meshWriteRecovery = validateMeshWriteRecovery(raw.meshWriteRecovery)
    const invocation: A2ADelegationInvocation = Object.freeze({
      ...raw,
      tenantId: required(raw.tenantId, 'tenantId'),
      environmentId: required(raw.environmentId, 'environmentId'),
      portableId: required(raw.portableId, 'portableId'),
      agentId: required(raw.agentId, 'agentId'),
      skillId: required(raw.skillId, 'skillId'),
      messageId: required(raw.messageId, 'messageId'),
      text: required(raw.text, 'text'),
      ...(meshWriteRecovery ? { meshWriteRecovery } : {}),
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
    let executionAttempted = false
    try {
      const rawTransport = options.transportFactory.create({ agentId: agent.agentId, transportRef: agent.transportRef, scope })
      const transport: A2ATransport = Object.freeze({
        async send(input) {
          executionAttempted = true
          return rawTransport.send(input)
        },
      })
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
          ...(skill.risk === 'advisory' && invocation.meshResume ? { signalboostMeshResume: JSON.stringify(invocation.meshResume) } : {}),
          ...(skill.risk !== 'advisory' && invocation.meshWriteRecovery ? { signalboostMeshWriteRecovery: JSON.stringify(invocation.meshWriteRecovery) } : {}),
        }),
      })
      result = Object.freeze({ ok: true, agentId: invocation.agentId, skillId: invocation.skillId, risk: skill.risk, data, mode: 'delegated' })
    } catch (error) {
      const failure = delegationFailure(error)
      result = Object.freeze({
        ok: false,
        agentId: invocation.agentId,
        skillId: invocation.skillId,
        risk: skill.risk,
        mode: failure.mode,
        error: failure.message,
      })
    }

    await appendObservation({ invocation, startedAtMs, result, assignmentId: assignment.assignmentId, transportRef: agent.transportRef, risk: skill.risk, approval, executionAttempted })
    await appendAudit({ invocation, assignmentId: assignment.assignmentId, risk: skill.risk, approval, result })
    return result
  }

  return Object.freeze({ invoke })
}
