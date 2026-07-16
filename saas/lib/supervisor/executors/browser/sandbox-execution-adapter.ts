import { runBrowserTask, resumeBrowserTask } from '../../../browser-runtime/runtime.ts'
import { InMemoryBrowserExecutionStore, InMemoryBrowserSessionRegistry, type BrowserExecutionStore, type BrowserSessionRegistry } from '../../../browser-runtime/execution-state.ts'
import type { BrowserAdapterContext, BrowserSessionFactory, BrowserTaskResult } from '../../../browser-runtime/contracts.ts'
import { parseSandboxBrowserExecutionRequest, type SandboxBrowserExecutionRequest } from './sandbox-execution-schema.ts'
import { promoteSandboxPackage, type PromotedSandboxPackage } from './sandbox-package-promoter.ts'
import type { SandboxOriginPolicy } from './sandbox-origin-policy.ts'
import { SandboxExecutionError } from './sandbox-execution-errors.ts'

export type SandboxTerminalStatus = 'rejected' | 'paused_for_approval' | 'completed' | 'failed' | 'verification_failed'
export interface SandboxExecutionAuditEvent { eventType: string; payload: Record<string, unknown> }
export interface SandboxExecutionResult { status: SandboxTerminalStatus; promoted?: PromotedSandboxPackage; runtimeResult?: BrowserTaskResult; auditEvents: SandboxExecutionAuditEvent[]; error?: { code: string; message: string } }
export interface SandboxExecutionAdapterDeps { policy: SandboxOriginPolicy; signingSecret: string; sessions: BrowserSessionFactory; context: BrowserAdapterContext; executionStore?: BrowserExecutionStore; sessionRegistry?: BrowserSessionRegistry; now?: () => Date }

function runtimeVerified(result: BrowserTaskResult): boolean { return result.verification !== 'pending' && result.verification.status === 'verified' }
function ev(eventType: string, payload: Record<string, unknown>): SandboxExecutionAuditEvent { return { eventType, payload } }

export class SandboxExecutionAdapter {
  private readonly executionStore: BrowserExecutionStore
  private readonly sessionRegistry: BrowserSessionRegistry
  private readonly deps: SandboxExecutionAdapterDeps
  constructor(deps: SandboxExecutionAdapterDeps) {
    this.deps = deps
    this.executionStore = deps.executionStore ?? new InMemoryBrowserExecutionStore()
    this.sessionRegistry = deps.sessionRegistry ?? new InMemoryBrowserSessionRegistry()
  }
  async execute(raw: unknown): Promise<SandboxExecutionResult> {
    const auditEvents: SandboxExecutionAuditEvent[] = []
    let request: SandboxBrowserExecutionRequest | undefined
    let promoted: PromotedSandboxPackage | undefined
    try {
      request = parseSandboxBrowserExecutionRequest(raw)
      auditEvents.push(ev('sandbox_execution_requested', { dispatchId: request.dispatchId, packageFingerprint: request.packageFingerprint, sandboxOrigin: request.sandboxOrigin }))
      promoted = promoteSandboxPackage(request, this.deps.policy)
      auditEvents.push(ev('sandbox_package_promoted', { ...promoted.metadata, approvedStepIds: promoted.approvedStepIds, checkpointStepId: promoted.checkpointStepId }))
      if (request.continuationApprovalToken) throw new SandboxExecutionError('missing_execution_id', 'Continuation requires the exact retained execution ID.')
      auditEvents.push(ev('sandbox_execution_started', { dispatchId: request.dispatchId, packageFingerprint: request.packageFingerprint }))
      const runtimeResult = await runBrowserTask({ task: promoted.task, signingSecret: this.deps.signingSecret, sessions: this.deps.sessions, context: this.deps.context, executionStore: this.executionStore, sessionRegistry: this.sessionRegistry, now: this.deps.now?.() })
      const base = { dispatchId: request.dispatchId, packageId: promoted.metadata.packageId, packageFingerprint: request.packageFingerprint, executionId: runtimeResult.executionId, sandboxOrigin: promoted.metadata.sandboxOrigin, completedStepIds: runtimeResult.completedStepIds, verification: runtimeResult.verification }
      if (runtimeResult.status === 'paused') { auditEvents.push(ev('sandbox_execution_paused', { ...base, checkpointReached: runtimeResult.pausedAtStepId })); return { status: runtimeVerified(runtimeResult) ? 'paused_for_approval' : 'verification_failed', promoted, runtimeResult, auditEvents } }
      if (runtimeResult.status === 'completed') { const ok = runtimeVerified(runtimeResult); auditEvents.push(ev(ok ? 'sandbox_execution_completed' : 'sandbox_verification_failed', base)); return { status: ok ? 'completed' : 'verification_failed', promoted, runtimeResult, auditEvents } }
      auditEvents.push(ev('sandbox_execution_failed', { ...base, error: runtimeResult.error }))
      return { status: 'failed', promoted, runtimeResult, auditEvents, error: { code: 'browser_runtime_failed', message: runtimeResult.error || 'Browser Runtime failed.' } }
    } catch (error) {
      const code = error instanceof SandboxExecutionError ? error.code : 'sandbox_execution_rejected'
      const message = error instanceof Error ? error.message : 'Sandbox execution rejected.'
      auditEvents.push(ev('sandbox_execution_failed', { dispatchId: request?.dispatchId ?? 'unknown', packageFingerprint: request?.packageFingerprint ?? 'unknown', errorCode: code }))
      return { status: 'rejected', promoted, auditEvents, error: { code, message } }
    }
  }
  async executeContinuation(raw: unknown, executionId: string): Promise<SandboxExecutionResult> {
    const request = parseSandboxBrowserExecutionRequest(raw)
    if (!request.continuationApprovalToken) return { status: 'rejected', auditEvents: [ev('sandbox_execution_failed', { dispatchId: request.dispatchId, errorCode: 'missing_continuation_approval' })], error: { code: 'missing_continuation_approval', message: 'Continuation approval token is required.' } }
    const promoted = promoteSandboxPackage(request, this.deps.policy)
    const runtimeResult = await resumeBrowserTask({ task: promoted.task, executionId, secondApprovalToken: request.continuationApprovalToken, signingSecret: this.deps.signingSecret, executionStore: this.executionStore, sessionRegistry: this.sessionRegistry, context: this.deps.context, now: this.deps.now?.() })
    const auditEvents = [ev('sandbox_continuation_started', { dispatchId: request.dispatchId, executionId }), ev(runtimeResult.status === 'completed' && runtimeVerified(runtimeResult) ? 'sandbox_execution_completed' : runtimeResult.status === 'completed' ? 'sandbox_verification_failed' : 'sandbox_execution_failed', { dispatchId: request.dispatchId, executionId, completedStepIds: runtimeResult.completedStepIds, verification: runtimeResult.verification })]
    return { status: runtimeResult.status === 'completed' ? (runtimeVerified(runtimeResult) ? 'completed' : 'verification_failed') : 'failed', promoted, runtimeResult, auditEvents, error: runtimeResult.status === 'failed' ? { code: 'browser_runtime_failed', message: runtimeResult.error || 'Browser Runtime failed.' } : undefined }
  }
}
