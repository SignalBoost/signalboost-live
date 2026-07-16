import { digestBrowserApprovalToken, verifyBrowserApprovalToken } from '../../../browser-runtime/approval.ts'
import { runBrowserTask, resumeBrowserTask } from '../../../browser-runtime/runtime.ts'
import { createBrowserExecutionId, InMemoryBrowserExecutionStore, InMemoryBrowserSessionRegistry, type BrowserExecutionStore, type BrowserSessionRegistry } from '../../../browser-runtime/execution-state.ts'
import type { BrowserAdapterContext, BrowserSessionFactory, BrowserTaskResult } from '../../../browser-runtime/contracts.ts'
import { parseSandboxBrowserExecutionRequest, type SandboxBrowserExecutionRequest } from './sandbox-execution-schema.ts'
import { promoteSandboxPackage, type PromotedSandboxPackage } from './sandbox-package-promoter.ts'
import type { SandboxOriginPolicy } from './sandbox-origin-policy.ts'
import { auditRecordSchemaVersion, executionRecordSchemaVersion, type ExecutionRecordStore, type PersistentExecutionRecord } from '../../persistence/index.ts'
import { SandboxExecutionError } from './sandbox-execution-errors.ts'
import { InMemorySandboxApprovalReplayGuard, type SandboxApprovalReplayGuard } from './approval-replay-guard.ts'

export type SandboxTerminalStatus = 'rejected' | 'paused_for_approval' | 'completed' | 'failed' | 'verification_failed'
export interface SandboxExecutionAuditEvent { eventType: string; payload: Record<string, unknown> }
export interface SandboxExecutionResult { status: SandboxTerminalStatus; promoted?: PromotedSandboxPackage; runtimeResult?: BrowserTaskResult; auditEvents: SandboxExecutionAuditEvent[]; error?: { code: string; message: string } }
export interface SandboxExecutionAdapterDeps { policy: SandboxOriginPolicy; signingSecret: string; sessions: BrowserSessionFactory; context: BrowserAdapterContext; executionStore?: BrowserExecutionStore; sessionRegistry?: BrowserSessionRegistry; approvalReplayGuard?: SandboxApprovalReplayGuard; persistentStore?: ExecutionRecordStore; now?: () => Date }

function runtimeVerified(result: BrowserTaskResult): boolean { return result.verification !== 'pending' && result.verification.status === 'verified' }
function ev(eventType: string, payload: Record<string, unknown>): SandboxExecutionAuditEvent { return { eventType, payload } }
function ts(d?: Date) { return (d ?? new Date()).toISOString() }
function eventId(type: string, dispatchId: string, executionId = 'pending') { return `${dispatchId}:${executionId}:${type}` }
function initialRecord(request: SandboxBrowserExecutionRequest, promoted: PromotedSandboxPackage, executionId: string, nowIso: string): PersistentExecutionRecord { return { executionId, dispatchId: request.dispatchId, incidentId: promoted.task.incidentId, planId: request.planId, packageId: promoted.metadata.packageId, packageFingerprint: request.packageFingerprint, provider: promoted.task.provider, targetEnvironment: 'sandbox', targetOrigin: promoted.metadata.sandboxOrigin, executorKind: 'browser', executionMode: 'sandbox_execute', status: 'requested', verificationStatus: 'pending', checkpointStatus: 'none', approvedStepIds: promoted.approvedStepIds, completedStepIds: [], skippedStepIds: [], startedAt: nowIso, createdAt: nowIso, updatedAt: nowIso, schemaVersion: executionRecordSchemaVersion, metadata: { adapterId: promoted.task.adapterId, note: 'Persistent record only; not an execution authority.' } } }

export class SandboxExecutionAdapter {
  private readonly executionStore: BrowserExecutionStore
  private readonly sessionRegistry: BrowserSessionRegistry
  private readonly approvalReplayGuard: SandboxApprovalReplayGuard
  private readonly deps: SandboxExecutionAdapterDeps
  constructor(deps: SandboxExecutionAdapterDeps) {
    this.deps = deps
    this.executionStore = deps.executionStore ?? new InMemoryBrowserExecutionStore()
    this.sessionRegistry = deps.sessionRegistry ?? new InMemoryBrowserSessionRegistry()
    this.approvalReplayGuard = deps.approvalReplayGuard ?? new InMemorySandboxApprovalReplayGuard()
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
      const executionNow = this.deps.now?.()
      const checkpointIndex = promoted.task.steps.findIndex(step => step.kind === 'checkpoint' && step.id === promoted.checkpointStepId)
      if (checkpointIndex < 0) throw new SandboxExecutionError('missing_approval_checkpoint', 'Sandbox execution approval checkpoint is missing.')
      const claims = verifyBrowserApprovalToken(promoted.task.approvalToken, promoted.task, this.deps.signingSecret, executionNow, { expectedStepIds: promoted.task.steps.slice(0, checkpointIndex + 1).map(step => step.id), expectedPhase: 1, expectedCheckpointStepId: promoted.checkpointStepId })
      await this.approvalReplayGuard.consume({ tokenDigest: digestBrowserApprovalToken(promoted.task.approvalToken), claims }, executionNow)
      auditEvents.push(ev('sandbox_execution_started', { dispatchId: request.dispatchId, packageFingerprint: request.packageFingerprint }))
      const executionId = createBrowserExecutionId(promoted.task, promoted.checkpointStepId)
      if (this.deps.persistentStore) {
        const nowIso = ts(executionNow)
        await this.deps.persistentStore.createExecution(initialRecord(request, promoted, executionId, nowIso))
        await this.deps.persistentStore.updateExecutionStatus(executionId, { status: 'started', verificationStatus: 'pending' })
      }
      const runtimeResult = await runBrowserTask({ task: promoted.task, signingSecret: this.deps.signingSecret, sessions: this.deps.sessions, context: this.deps.context, executionStore: this.executionStore, sessionRegistry: this.sessionRegistry, now: executionNow })
      const base = { dispatchId: request.dispatchId, packageId: promoted.metadata.packageId, packageFingerprint: request.packageFingerprint, executionId, sandboxOrigin: promoted.metadata.sandboxOrigin, completedStepIds: runtimeResult.completedStepIds, verification: runtimeResult.verification }
      if (runtimeResult.status === 'paused') { auditEvents.push(ev('sandbox_execution_paused', { ...base, checkpointReached: runtimeResult.pausedAtStepId })); if (this.deps.persistentStore) { await this.deps.persistentStore.updateExecutionStatus(executionId, { status: runtimeVerified(runtimeResult) ? 'paused_for_approval' : 'verification_failed', verificationStatus: runtimeVerified(runtimeResult) ? 'verified' : 'failed', checkpointStatus: 'pending_approval', completedStepIds: runtimeResult.completedStepIds, skippedStepIds: promoted.approvedStepIds.filter(id => !runtimeResult.completedStepIds.includes(id)), pausedAt: runtimeResult.finishedAt }); await this.persistRuntimeArtifacts(executionId, request, runtimeResult, auditEvents) } return { status: runtimeVerified(runtimeResult) ? 'paused_for_approval' : 'verification_failed', promoted, runtimeResult, auditEvents } }
      if (runtimeResult.status === 'completed') { const ok = runtimeVerified(runtimeResult); auditEvents.push(ev(ok ? 'sandbox_execution_completed' : 'sandbox_verification_failed', base)); if (this.deps.persistentStore) { await this.deps.persistentStore.updateExecutionStatus(executionId, { status: ok ? 'completed' : 'verification_failed', verificationStatus: ok ? 'verified' : 'failed', checkpointStatus: 'approved', completedStepIds: runtimeResult.completedStepIds, skippedStepIds: promoted.approvedStepIds.filter(id => !runtimeResult.completedStepIds.includes(id)), completedAt: ok ? runtimeResult.finishedAt : undefined, failedAt: ok ? undefined : runtimeResult.finishedAt }); await this.persistRuntimeArtifacts(executionId, request, runtimeResult, auditEvents) } return { status: ok ? 'completed' : 'verification_failed', promoted, runtimeResult, auditEvents } }
      auditEvents.push(ev('sandbox_execution_failed', { ...base, error: runtimeResult.error }))
      if (this.deps.persistentStore) { await this.deps.persistentStore.updateExecutionStatus(executionId, { status: 'failed', verificationStatus: runtimeResult.verification === 'pending' ? 'pending' : runtimeResult.verification.status === 'verified' ? 'verified' : 'failed', completedStepIds: runtimeResult.completedStepIds, failedAt: runtimeResult.finishedAt, error: { code: 'browser_runtime_failed', message: runtimeResult.error || 'Browser Runtime failed.' } }); await this.persistRuntimeArtifacts(executionId, request, runtimeResult, auditEvents) }
      return { status: 'failed', promoted, runtimeResult, auditEvents, error: { code: 'browser_runtime_failed', message: runtimeResult.error || 'Browser Runtime failed.' } }
    } catch (error) {
      const code = error instanceof SandboxExecutionError ? error.code : promoted ? 'browser_approval_rejected' : 'sandbox_execution_rejected'
      const message = error instanceof Error ? error.message : 'Sandbox execution rejected.'
      auditEvents.push(ev('sandbox_execution_failed', { dispatchId: request?.dispatchId ?? 'unknown', packageFingerprint: request?.packageFingerprint ?? 'unknown', errorCode: code }))
      return { status: promoted ? 'failed' : 'rejected', promoted, auditEvents, error: { code, message } }
    }
  }
  private async persistRuntimeArtifacts(executionId: string, request: SandboxBrowserExecutionRequest, runtimeResult: BrowserTaskResult, auditEvents: SandboxExecutionAuditEvent[]): Promise<void> { if (!this.deps.persistentStore) return; const nowIso = ts(this.deps.now?.()); for (const a of auditEvents) await this.deps.persistentStore.appendAuditEvent({ eventId: eventId(a.eventType, request.dispatchId, executionId), executionId, dispatchId: request.dispatchId, incidentId: runtimeResult.incidentId, eventType: a.eventType, occurredAt: nowIso, payload: a.payload as never, schemaVersion: auditRecordSchemaVersion, createdAt: nowIso }); for (const e of runtimeResult.evidence) if (e.artifactRef) await this.deps.persistentStore.attachEvidenceReference({ evidenceId: `${executionId}:${e.sequence}:${e.stepId}`, executionId, stepId: e.stepId, evidenceType: e.kind, artifactReference: e.artifactRef, capturedAt: e.timestamp, metadata: { summary: e.summary, url: e.url ?? '' }, schemaVersion: auditRecordSchemaVersion }) }
  async executeContinuation(raw: unknown, executionId: string): Promise<SandboxExecutionResult> {
    const auditEvents: SandboxExecutionAuditEvent[] = []
    let request: SandboxBrowserExecutionRequest
    let promoted: PromotedSandboxPackage | undefined
    try {
      request = parseSandboxBrowserExecutionRequest(raw)
      if (!request.continuationApprovalToken) return { status: 'rejected', auditEvents: [ev('sandbox_execution_failed', { dispatchId: request.dispatchId, errorCode: 'missing_continuation_approval' })], error: { code: 'missing_continuation_approval', message: 'Continuation approval token is required.' } }
      promoted = promoteSandboxPackage(request, this.deps.policy)
      const executionNow = this.deps.now?.()
      const record = await this.executionStore.load(executionId)
      if (!record) { await this.sessionRegistry.discard(executionId).catch(() => undefined); throw new SandboxExecutionError('missing_execution_record', 'Resumable browser execution record is missing.') }
      const claims = verifyBrowserApprovalToken(request.continuationApprovalToken, promoted.task, this.deps.signingSecret, executionNow, { expectedStepIds: record.remainingSteps.map(step => step.id), expectedPhase: 2, expectedCheckpointStepId: record.checkpointStepId, expectedExecutionId: executionId, expectedPreApprovalTokenDigest: record.preApprovalTokenDigest })
      await this.approvalReplayGuard.consume({ tokenDigest: digestBrowserApprovalToken(request.continuationApprovalToken), claims }, executionNow)
      if (this.deps.persistentStore) await this.deps.persistentStore.recordContinuation(executionId, ts(executionNow))
      const runtimeResult = await resumeBrowserTask({ task: promoted.task, executionId, secondApprovalToken: request.continuationApprovalToken, signingSecret: this.deps.signingSecret, executionStore: this.executionStore, sessionRegistry: this.sessionRegistry, context: this.deps.context, now: executionNow })
      auditEvents.push(ev('sandbox_continuation_started', { dispatchId: request.dispatchId, executionId }), ev(runtimeResult.status === 'completed' && runtimeVerified(runtimeResult) ? 'sandbox_execution_completed' : runtimeResult.status === 'completed' ? 'sandbox_verification_failed' : 'sandbox_execution_failed', { dispatchId: request.dispatchId, executionId, completedStepIds: runtimeResult.completedStepIds, verification: runtimeResult.verification }))
      if (this.deps.persistentStore) { await this.deps.persistentStore.updateExecutionStatus(executionId, { status: runtimeResult.status === 'completed' ? (runtimeVerified(runtimeResult) ? 'completed' : 'verification_failed') : 'failed', verificationStatus: runtimeResult.verification === 'pending' ? 'pending' : runtimeResult.verification.status === 'verified' ? 'verified' : 'failed', completedStepIds: runtimeResult.completedStepIds, completedAt: runtimeResult.status === 'completed' && runtimeVerified(runtimeResult) ? runtimeResult.finishedAt : undefined, failedAt: runtimeResult.status !== 'completed' || !runtimeVerified(runtimeResult) ? runtimeResult.finishedAt : undefined, error: runtimeResult.error ? { code: 'browser_runtime_failed', message: runtimeResult.error } : undefined }); await this.persistRuntimeArtifacts(executionId, request, runtimeResult, auditEvents) }
      return { status: runtimeResult.status === 'completed' ? (runtimeVerified(runtimeResult) ? 'completed' : 'verification_failed') : 'failed', promoted, runtimeResult, auditEvents, error: runtimeResult.status === 'failed' ? { code: 'browser_runtime_failed', message: runtimeResult.error || 'Browser Runtime failed.' } : undefined }
    } catch (error) {
      const code = error instanceof SandboxExecutionError ? error.code : 'browser_continuation_approval_rejected'
      const message = error instanceof Error ? error.message : 'Sandbox continuation rejected.'
      auditEvents.push(ev('sandbox_execution_failed', { dispatchId: typeof raw === 'object' && raw && 'dispatchId' in raw ? String((raw as { dispatchId?: unknown }).dispatchId ?? 'unknown') : 'unknown', executionId, errorCode: code }))
      return { status: 'failed', promoted, auditEvents, error: { code, message } }
    }
  }
}
