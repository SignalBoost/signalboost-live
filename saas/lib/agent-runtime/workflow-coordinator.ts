// saas/lib/agent-runtime/workflow-coordinator.ts
import { createAgentOperationActivityRecord } from './activity-store.ts'
import { guardAgentSandboxProvider } from './provider-guard.ts'
import { createAgentWorkflowAuditEvent } from './workflow-audit.ts'
import { normalizeRequestId, normalizeUserId, normalizeWorkflowId } from './workflow-identifiers.ts'
import { authorizationDenial, internalBoundedFailure, providerUnavailable, quotaDenial, repairFailure, verifiedSuccess } from './workflow-result.ts'
import type { AgentWorkflowAuditAction, AgentWorkflowAuditEvent, AgentWorkflowCoordinatorDependencies, AgentWorkflowPrincipal, AgentWorkflowRequest, AgentWorkflowResult, AgentWorkflowTimingMetadata, AgentWorkflowCleanupStatus } from './workflow-types.ts'

const safeError = (error: unknown) => String(error instanceof Error ? error.message : 'Internal workflow failure.').replace(/(?:bearer\s+\S+|(?:token|secret|key|password)\s*[=:]\s*\S+|https?:\/\/\S+)/gi, '[REDACTED]').slice(0, 256)

/** Control-plane only. It has no transport, filesystem, environment, or execution dependency. */
export class AgentWorkflowCoordinator {
  private readonly now: () => number
  // Explicit field, not a constructor parameter property: `node --test` strips types
  // rather than compiling them, and strip-only mode cannot emit the implicit assignment.
  private readonly dependencies: AgentWorkflowCoordinatorDependencies
  constructor(dependencies: AgentWorkflowCoordinatorDependencies) { this.dependencies = dependencies; this.now = dependencies.now ?? Date.now }

  async run(principal: AgentWorkflowPrincipal, request: AgentWorkflowRequest): Promise<AgentWorkflowResult> {
    const startedAtMs = this.now(); const deadlineMs = startedAtMs + this.dependencies.runtimePolicy.maximumWorkflowTimeMs
    let requestId = 'invalid', workflowId = 'invalid', userId = 'invalid', providerId: string | undefined
    let reserved = false, released = false, releaseSucceeded = false
    const events: AgentWorkflowAuditEvent[] = []
    const timing = (): AgentWorkflowTimingMetadata => Object.freeze({ startedAtMs, completedAtMs: this.now(), totalDurationMs: Math.max(0, this.now() - startedAtMs), deadlineMs })
    const cleanup = (): AgentWorkflowCleanupStatus => Object.freeze({ quotaReserved: reserved, quotaReleased: released, quotaReleaseSucceeded: releaseSucceeded })
    const emit = (action: AgentWorkflowAuditAction, extra: Partial<AgentWorkflowAuditEvent> = {}) => {
      const rawId = this.dependencies.createAuditId ? this.dependencies.createAuditId() : `audit:${events.length + 1}`
      events.push(createAgentWorkflowAuditEvent({ eventId: rawId, action, requestId, workflowId, userId, providerId, language: request.language, quotaCostUnits: request.estimatedCostUnits, ...extra }, this.now))
    }
    const releaseQuota = () => {
      if (!reserved || released) return
      try { this.dependencies.quotaLedger.release(`workflow:${workflowId}`); released = true; releaseSucceeded = true; emit('quota_released') }
      catch { released = true; releaseSucceeded = false; emit('quota_release_failed') }
    }
    const expired = () => this.now() >= deadlineMs
    type Outcome = { type: 'authorization'; reason: string } | { type: 'quota'; reason: string } | { type: 'provider'; reason: string } | { type: 'repair'; category: string; message: string } | { type: 'internal'; stage: 'validation' | 'authorization' | 'quota_reservation' | 'provider_resolution' | 'repair' | 'quota_release' | 'completed'; message: string } | { type: 'success'; attempts: number; corrections: number }
    let outcome: Outcome
    const finalize = async (value: Outcome): Promise<AgentWorkflowResult> => {
      releaseQuota()
      const result = this.finish(value, timing, cleanup, events, emit)
      await this.dependencies.activityStore.record(createAgentOperationActivityRecord({ workflowId, requestId, providerId, result }))
      return result
    }
    try {
      try {
        requestId = normalizeRequestId(request.requestId); workflowId = normalizeWorkflowId(request.workflowId); userId = normalizeUserId(request.userId)
        if (!Number.isSafeInteger(request.estimatedCostUnits) || request.estimatedCostUnits <= 0 || request.estimatedCostUnits > this.dependencies.providerConfig.maximumWorkflowCostUnits) throw new Error('Invalid cost units.')
        emit('workflow_received')
      } catch (error) { emit('validation_denied', { denialReason: 'invalid_request' }); outcome = { type: 'internal', stage: 'validation', message: safeError(error) }; return await finalize(outcome) }
      let guard
      try { guard = guardAgentSandboxProvider({ principal, toolPolicy: this.dependencies.toolPolicy, providerConfig: this.dependencies.providerConfig, runtimePolicy: this.dependencies.runtimePolicy, quota: this.dependencies.quotaLedger.snapshot(userId), language: request.language, capabilities: Object.freeze([...request.capabilities]), supportedLanguages: this.dependencies.supportedLanguages, supportedCapabilities: this.dependencies.supportedCapabilities }) }
      catch (error) { outcome = { type: 'internal', stage: 'authorization', message: safeError(error) }; return await finalize(outcome) }
      if (!guard.authorized) { emit('authorization_denied', { denialReason: guard.reason }); outcome = { type: 'authorization', reason: guard.reason }; return await finalize(outcome) }
      if (expired()) { outcome = { type: 'repair', category: 'timeout', message: 'Workflow deadline exceeded.' }; return await finalize(outcome) }
      try { reserved = this.dependencies.quotaLedger.reserve(`workflow:${workflowId}`, userId, request.estimatedCostUnits) } catch (error) { outcome = { type: 'quota', reason: safeError(error) }; return await finalize(outcome) }
      if (!reserved) { emit('quota_denied', { denialReason: 'quota_exceeded' }); outcome = { type: 'quota', reason: 'quota_exceeded' }; return await finalize(outcome) }
      emit('quota_reserved')
      if (expired()) { outcome = { type: 'repair', category: 'timeout', message: 'Workflow deadline exceeded.' }; return await finalize(outcome) }
      let provider: ReturnType<AgentWorkflowCoordinatorDependencies['providerRegistry']['getConfiguredProvider']>
      try { provider = this.dependencies.providerRegistry.getConfiguredProvider(); providerId = (provider as { providerId?: string }).providerId } catch (error) { emit('provider_unavailable'); outcome = { type: 'provider', reason: safeError(error) }; return await finalize(outcome) }
      if (!provider || providerId === 'disabled') { emit('provider_unavailable'); outcome = { type: 'provider', reason: 'Configured provider is unavailable.' }; return await finalize(outcome) }
      emit('provider_resolved')
      if (expired()) { outcome = { type: 'repair', category: 'timeout', message: 'Workflow deadline exceeded.' }; return await finalize(outcome) }
      let controller
      try { controller = this.dependencies.createRepairController(provider) } catch (error) { outcome = { type: 'internal', stage: 'repair', message: safeError(error) }; return await finalize(outcome) }
      emit('repair_started')
      try { const repair = await controller.run(request.repairRequest); if (repair.verified) { emit('repair_completed', { attemptCount: repair.candidatesEvaluated, correctionCount: repair.correctionsRequested, verified: true }); outcome = { type: 'success', attempts: repair.candidatesEvaluated, corrections: repair.correctionsRequested } } else { emit('repair_failed', { attemptCount: repair.attemptsUsed, correctionCount: repair.correctionsRequested, failureCategory: repair.category, failedStage: 'repair' }); outcome = { type: 'repair', category: repair.workflowTimedOut ? 'timeout' : repair.category, message: repair.diagnostic.safeSummary } } }
      catch (error) { emit('repair_failed', { failureCategory: 'internal', failedStage: 'repair' }); outcome = { type: 'repair', category: 'internal', message: safeError(error) } }
      return await finalize(outcome)
    } finally {
      releaseQuota()
    }
  }

  private finish(outcome: any, timing: () => AgentWorkflowTimingMetadata, cleanup: () => AgentWorkflowCleanupStatus, events: AgentWorkflowAuditEvent[], emit: (action: AgentWorkflowAuditAction, extra?: Partial<AgentWorkflowAuditEvent>) => void): AgentWorkflowResult {
    const build = () => outcome.type === 'success' ? verifiedSuccess(outcome.attempts, outcome.corrections, timing(), cleanup(), events) : outcome.type === 'authorization' ? authorizationDenial(outcome.reason, timing(), cleanup(), events) : outcome.type === 'quota' ? quotaDenial(outcome.reason, timing(), cleanup(), events) : outcome.type === 'provider' ? providerUnavailable(outcome.reason, timing(), cleanup(), events) : outcome.type === 'repair' ? repairFailure(outcome.category, outcome.message, timing(), cleanup(), events) : internalBoundedFailure(outcome.stage, outcome.message, timing(), cleanup(), events)
    emit(outcome.type === 'success' ? 'workflow_completed' : 'workflow_failed', { verified: outcome.type === 'success', failureCategory: outcome.type === 'repair' ? outcome.category : undefined })
    return build()
  }
}
