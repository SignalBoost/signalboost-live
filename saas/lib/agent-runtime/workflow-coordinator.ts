import { guardAgentSandboxProvider } from './provider-guard.ts'
import { createAgentWorkflowAuditEvent } from './workflow-audit.ts'
import { normalizeRequestId, normalizeUserId, normalizeWorkflowId } from './workflow-identifiers.ts'
import { authorizationDenial, internalBoundedFailure, providerUnavailable, quotaDenial, repairFailure, verifiedSuccess } from './workflow-result.ts'
import type { AgentWorkflowAuditAction, AgentWorkflowAuditEvent, AgentWorkflowCleanupStatus, AgentWorkflowCoordinatorDependencies, AgentWorkflowPrincipal, AgentWorkflowRequest, AgentWorkflowResult, AgentWorkflowStage, AgentWorkflowTimingMetadata } from './workflow-types.ts'

const message = (error: unknown) => String(error instanceof Error ? error.message : 'Internal workflow failure.').replace(/(?:bearer\s+\S+|(?:token|secret|key)\s*[=:]\s*\S+)/gi, '[REDACTED]').slice(0, 256)
export class AgentWorkflowCoordinator {
  private readonly now: () => number
  constructor(private readonly dependencies: AgentWorkflowCoordinatorDependencies) { this.now = dependencies.now ?? Date.now }
  async run(principal: AgentWorkflowPrincipal, request: AgentWorkflowRequest): Promise<AgentWorkflowResult> {
    const startedAtMs = this.now(); const deadlineMs = startedAtMs + this.dependencies.runtimePolicy.maximumWorkflowTimeMs
    let requestId = 'invalid', workflowId = 'invalid', userId = 'invalid'; let providerId: string | undefined
    let reserved = false, released = false, releaseSucceeded = false; const events: AgentWorkflowAuditEvent[] = []
    const timing = (): AgentWorkflowTimingMetadata => Object.freeze({ startedAtMs, completedAtMs: this.now(), totalDurationMs: Math.max(0, this.now() - startedAtMs), deadlineMs })
    const cleanup = (): AgentWorkflowCleanupStatus => Object.freeze({ quotaReserved: reserved, quotaReleased: released, quotaReleaseSucceeded: releaseSucceeded })
    const event = (action: AgentWorkflowAuditAction, extra: Partial<AgentWorkflowAuditEvent> = {}) => { const id = this.dependencies.createAuditId ? this.dependencies.createAuditId() : `audit:${events.length + 1}`; events.push(createAgentWorkflowAuditEvent({ eventId: id, action, requestId, workflowId, userId, providerId, language: request.language, quotaCostUnits: request.estimatedCostUnits, ...extra }, this.now)) }
    const finish = (result: AgentWorkflowResult, action: AgentWorkflowAuditAction = result.kind === 'success' ? 'workflow_completed' : 'workflow_failed'): AgentWorkflowResult => { if (reserved && !released) { try { this.dependencies.quotaLedger.release(`workflow:${workflowId}`); released = true; releaseSucceeded = true; event('quota_released') } catch { released = true; releaseSucceeded = false; event('quota_release_failed') } }; event(action, { verified: result.kind === 'success', failureCategory: result.kind === 'failure' ? result.category : undefined }); const finalEvents = Object.freeze([...events]); return result.kind === 'success' ? verifiedSuccess(result.attempts, result.corrections, timing(), cleanup(), finalEvents) : result.kind === 'denial' ? Object.freeze({ ...result, timing: timing(), cleanup: cleanup(), auditEvents: finalEvents }) : Object.freeze({ ...result, timing: timing(), cleanup: cleanup(), auditEvents: finalEvents }) }
    try { requestId = normalizeRequestId(request.requestId); workflowId = normalizeWorkflowId(request.workflowId); userId = normalizeUserId(request.userId); if (!Number.isSafeInteger(request.estimatedCostUnits) || request.estimatedCostUnits <= 0 || request.estimatedCostUnits > this.dependencies.providerConfig.maximumWorkflowCostUnits) throw new Error('Invalid cost units.'); event('workflow_received') }
    catch (error) { event('validation_denied', { denialReason: 'invalid_request' }); return finish(internalBoundedFailure('validation', message(error), timing(), cleanup(), events), 'workflow_failed') }
    try {
      let guard
      try { guard = guardAgentSandboxProvider({ principal, toolPolicy: this.dependencies.toolPolicy, providerConfig: this.dependencies.providerConfig, runtimePolicy: this.dependencies.runtimePolicy, quota: this.dependencies.quotaLedger.snapshot(userId), language: request.language, capabilities: Object.freeze([...request.capabilities]), supportedLanguages: this.dependencies.supportedLanguages, supportedCapabilities: this.dependencies.supportedCapabilities }) } catch (error) { return finish(internalBoundedFailure('authorization', message(error), timing(), cleanup(), events)) }
      if (!guard.authorized) { event('authorization_denied', { denialReason: guard.reason }); return finish(authorizationDenial(guard.reason, timing(), cleanup(), events)) }
      if (this.now() >= deadlineMs) return finish(internalBoundedFailure('authorization', 'Workflow deadline exceeded.', timing(), cleanup(), events))
      try { reserved = this.dependencies.quotaLedger.reserve(`workflow:${workflowId}`, userId, request.estimatedCostUnits) } catch (error) { return finish(repairFailure('quota_failure', message(error), timing(), cleanup(), events)) }
      if (!reserved) { event('quota_denied', { denialReason: 'quota_exceeded' }); return finish(quotaDenial('quota_exceeded', timing(), cleanup(), events)) }
      event('quota_reserved')
      if (this.now() >= deadlineMs) return finish(repairFailure('timeout', 'Workflow deadline exceeded.', timing(), cleanup(), events))
      let provider
      try { provider = this.dependencies.providerRegistry.getConfiguredProvider(); providerId = (provider as { providerId?: string }).providerId } catch (error) { return finish(providerUnavailable(message(error), timing(), cleanup(), events)) }
      if (!provider || providerId === 'disabled') { event('provider_unavailable'); return finish(providerUnavailable('Configured provider is unavailable.', timing(), cleanup(), events)) }
      event('provider_resolved')
      if (this.now() >= deadlineMs) return finish(repairFailure('timeout', 'Workflow deadline exceeded.', timing(), cleanup(), events))
      let controller
      try { controller = this.dependencies.createRepairController(provider) } catch (error) { return finish(internalBoundedFailure('repair', message(error), timing(), cleanup(), events)) }
      event('repair_started')
      try { const result = await controller.run(request.repairRequest); if (result.verified) { event('repair_completed', { attemptCount: result.candidatesEvaluated, correctionCount: result.correctionsRequested, verified: true }); return finish(verifiedSuccess(result.candidatesEvaluated, result.correctionsRequested, timing(), cleanup(), events)) }; event('repair_failed', { attemptCount: result.attemptsUsed, correctionCount: result.correctionsRequested, failureCategory: result.category }); return finish(repairFailure(result.workflowTimedOut ? 'timeout' : result.category, result.diagnostic.safeSummary, timing(), cleanup(), events)) } catch (error) { event('repair_failed', { failureCategory: 'internal' }); return finish(repairFailure('internal', message(error), timing(), cleanup(), events)) }
    } finally { if (reserved && !released) { try { this.dependencies.quotaLedger.release(`workflow:${workflowId}`); released = true; releaseSucceeded = true; event('quota_released') } catch { released = true; releaseSucceeded = false; event('quota_release_failed') } } }
  }
}
