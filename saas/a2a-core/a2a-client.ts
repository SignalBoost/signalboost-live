export const A2A_PROTOCOL_VERSION = '0.3.0' as const
export const SIGNALBOOST_A2A_CLIENT_VERSION = 'signalboost-a2a-client-v1' as const

export interface A2AAgentSkill {
  id: string
  name: string
  description: string
  tags: readonly string[]
  inputModes?: readonly string[]
  outputModes?: readonly string[]
}

export interface A2AAgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  preferredTransport?: string
  defaultInputModes: readonly string[]
  defaultOutputModes: readonly string[]
  skills: readonly A2AAgentSkill[]
}

export interface A2AScope {
  tenantId: string
  environmentId: string
  portableId: string
  actor?: { userId?: string; roles?: readonly string[] }
}

export interface A2ATransport {
  /** Host-owned transport: endpoint resolution, TLS, auth, proxying and credentials stay outside A2A core. */
  send(input: {
    agentId: string
    transportRef: string
    scope: A2AScope
    request: Readonly<Record<string, unknown>>
    timeoutMs: number
  }): Promise<unknown>
}

export interface A2AMessageInput {
  messageId: string
  text: string
  contextId?: string
  taskId?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export type A2ASendResult = Readonly<Record<string, unknown>>

export interface A2AClient {
  sendMessage(input: A2AMessageInput): Promise<A2ASendResult>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A ${name} is required`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`A2A ${name} must be positive`)
  return Math.floor(resolved)
}

function boundedStrings(values: unknown, name: string, max: number): readonly string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > max) throw new Error(`A2A ${name} is invalid`)
  return Object.freeze(values.map(value => required(value, name)))
}

function validHttpsUrl(value: unknown): string {
  const url = required(value, 'agentCard.url')
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('a2a_agent_card_url_invalid') }
  if (parsed.protocol !== 'https:') throw new Error('a2a_agent_card_url_must_be_https')
  return url
}

/** Validate a standard A2A 0.3 Agent Card before converting it into SignalBoost registry metadata. */
export function validateA2AAgentCard(value: unknown): A2AAgentCard {
  if (!plain(value)) throw new Error('a2a_agent_card_invalid')
  const protocolVersion = required(value.protocolVersion, 'agentCard.protocolVersion')
  if (protocolVersion !== A2A_PROTOCOL_VERSION) throw new Error(`a2a_protocol_version_unsupported:${protocolVersion}`)
  const skillsRaw = value.skills
  if (!Array.isArray(skillsRaw) || skillsRaw.length === 0 || skillsRaw.length > 128) throw new Error('a2a_agent_card_skills_invalid')
  const seen = new Set<string>()
  const skills = skillsRaw.map((item, index): A2AAgentSkill => {
    if (!plain(item)) throw new Error(`a2a_agent_skill_invalid:${index}`)
    const id = required(item.id, 'agentSkill.id')
    if (seen.has(id)) throw new Error(`a2a_duplicate_agent_skill:${id}`)
    seen.add(id)
    return Object.freeze({
      id,
      name: required(item.name, 'agentSkill.name'),
      description: required(item.description, 'agentSkill.description'),
      tags: boundedStrings(item.tags, 'agentSkill.tags', 32),
      ...(item.inputModes === undefined ? {} : { inputModes: boundedStrings(item.inputModes, 'agentSkill.inputModes', 16) }),
      ...(item.outputModes === undefined ? {} : { outputModes: boundedStrings(item.outputModes, 'agentSkill.outputModes', 16) }),
    })
  })
  return Object.freeze({
    protocolVersion,
    name: required(value.name, 'agentCard.name'),
    description: required(value.description, 'agentCard.description'),
    url: validHttpsUrl(value.url),
    preferredTransport: value.preferredTransport === undefined ? undefined : required(value.preferredTransport, 'agentCard.preferredTransport'),
    defaultInputModes: boundedStrings(value.defaultInputModes, 'agentCard.defaultInputModes', 16),
    defaultOutputModes: boundedStrings(value.defaultOutputModes, 'agentCard.defaultOutputModes', 16),
    skills: Object.freeze(skills),
  })
}

const TASK_STATES = new Set(['submitted', 'working', 'input-required', 'completed', 'canceled', 'failed', 'rejected', 'auth-required', 'unknown'])

function validateMessage(value: unknown): Readonly<Record<string, unknown>> {
  if (!plain(value) || value.kind !== 'message') throw new Error('a2a_invalid_message_result')
  required(value.messageId, 'result.messageId')
  if (value.role !== 'user' && value.role !== 'agent') throw new Error('a2a_invalid_message_role')
  if (!Array.isArray(value.parts) || value.parts.length > 64) throw new Error('a2a_invalid_message_parts')
  return Object.freeze({ ...value })
}

function validateTask(value: unknown): Readonly<Record<string, unknown>> {
  if (!plain(value) || value.kind !== 'task') throw new Error('a2a_invalid_task_result')
  required(value.id, 'result.task.id')
  if (!plain(value.status) || !TASK_STATES.has(String(value.status.state ?? ''))) throw new Error('a2a_invalid_task_status')
  if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || value.artifacts.length > 64)) throw new Error('a2a_invalid_task_artifacts')
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 128)) throw new Error('a2a_invalid_task_history')
  return Object.freeze({ ...value })
}

function validateSendResult(value: unknown): A2ASendResult {
  if (!plain(value)) throw new Error('a2a_invalid_send_result')
  if (value.kind === 'message') return validateMessage(value)
  if (value.kind === 'task') return validateTask(value)
  throw new Error('a2a_unknown_send_result_kind')
}

export function createA2AClient(options: {
  agentId: string
  transportRef: string
  scope: A2AScope
  transport: A2ATransport
  timeoutMs?: number
}): A2AClient {
  const agentId = required(options.agentId, 'agentId')
  const transportRef = required(options.transportRef, 'transportRef')
  const scope = Object.freeze({
    tenantId: required(options.scope.tenantId, 'scope.tenantId'),
    environmentId: required(options.scope.environmentId, 'scope.environmentId'),
    portableId: required(options.scope.portableId, 'scope.portableId'),
    ...(options.scope.actor ? { actor: Object.freeze({ ...options.scope.actor }) } : {}),
  })
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000, 'timeoutMs')
  let nextId = 0

  return Object.freeze({
    async sendMessage(input) {
      const id = ++nextId
      const messageId = required(input.messageId, 'message.messageId')
      const text = required(input.text, 'message.text')
      if (text.length > 32_000) throw new Error('a2a_message_text_too_large')
      const request = Object.freeze({
        jsonrpc: '2.0',
        id,
        method: 'message/send',
        params: Object.freeze({
          message: Object.freeze({
            kind: 'message',
            role: 'user',
            messageId,
            parts: Object.freeze([{ kind: 'text', text }]),
            ...(input.contextId ? { contextId: required(input.contextId, 'message.contextId') } : {}),
            ...(input.taskId ? { taskId: required(input.taskId, 'message.taskId') } : {}),
            ...(input.metadata ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
          }),
        }),
      })
      const raw = await options.transport.send({ agentId, transportRef, scope, request, timeoutMs })
      if (!plain(raw) || raw.jsonrpc !== '2.0') throw new Error('a2a_invalid_jsonrpc_response')
      if (raw.id !== id) throw new Error('a2a_response_id_mismatch')
      const hasResult = Object.prototype.hasOwnProperty.call(raw, 'result')
      const hasError = Object.prototype.hasOwnProperty.call(raw, 'error')
      if (hasResult === hasError) throw new Error('a2a_response_must_have_exactly_one_result_or_error')
      if (hasError) {
        const error = plain(raw.error) ? raw.error : {}
        const code = typeof error.code === 'number' ? error.code : 'unknown'
        const message = typeof error.message === 'string' && error.message.trim() ? error.message.trim() : 'remote A2A error'
        throw new Error(`a2a_remote_error_${code}:${message}`)
      }
      return validateSendResult(raw.result)
    },
  })
}
