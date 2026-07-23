import { createAgentSandboxAuditEvent } from './provider-audit.ts'
import type { AgentWorkflowAuditAction, AgentWorkflowAuditEvent } from './workflow-types.ts'
import { normalizeAuditEventId, normalizeRequestId, normalizeUserId, normalizeWorkflowId } from './workflow-identifiers.ts'

const clip = (value: string | undefined, maximum = 128) => value ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/(?:bearer\s+\S+|(?:token|secret|password|api[_ -]?key)\s*[=:]\s*\S+|https?:\/\/\S+)/gi, '[REDACTED]').slice(0, maximum) : undefined
export function createAgentWorkflowAuditEvent(input: Omit<AgentWorkflowAuditEvent, 'timestamp'> & { timestamp?: string }, now: () => number = Date.now): AgentWorkflowAuditEvent {
  const action = input.action as AgentWorkflowAuditAction
  const timestamp = input.timestamp ?? new Date(now()).toISOString()
  createAgentSandboxAuditEvent({ eventId: input.eventId, requestId: input.requestId, userId: input.userId, providerId: input.providerId === 'remote' ? 'remote' : 'disabled', action, outcome: action.includes('denied') || action.includes('unavailable') ? 'denied' : action.includes('failed') ? 'failed' : 'completed', timestamp })
  return Object.freeze({ eventId: normalizeAuditEventId(input.eventId), action, requestId: normalizeRequestId(input.requestId), workflowId: normalizeWorkflowId(input.workflowId), userId: normalizeUserId(input.userId), ...(input.providerId ? { providerId: clip(input.providerId) } : {}), ...(input.language ? { language: input.language } : {}), ...(Number.isSafeInteger(input.attemptCount) && input.attemptCount! >= 0 ? { attemptCount: input.attemptCount } : {}), ...(Number.isSafeInteger(input.correctionCount) && input.correctionCount! >= 0 ? { correctionCount: input.correctionCount } : {}), ...(typeof input.verified === 'boolean' ? { verified: input.verified } : {}), ...(input.denialReason ? { denialReason: clip(input.denialReason) } : {}), ...(input.failureCategory ? { failureCategory: clip(input.failureCategory) } : {}), ...(input.failedStage ? { failedStage: input.failedStage } : {}), ...(Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, input.durationMs!) } : {}), ...(Number.isFinite(input.quotaCostUnits) ? { quotaCostUnits: Math.max(0, input.quotaCostUnits!) } : {}), timestamp })
}
export const freezeWorkflowAuditEvents = (events: readonly AgentWorkflowAuditEvent[]) => Object.freeze([...events])
