import { incidentSchema, isPlainSerializable, type SerializableValue } from '../incident-schema.ts'
import { repairPlanSchema, type RepairPlan, type RepairStep } from '../repair-plan-schema.ts'
import type { PolicyDecision } from '../execution-contracts.ts'
import { ExecutorRegistry } from './executor-registry.ts'
import { DispatchValidationError, ExecutorRegistryError } from './errors.ts'
import { browserReasons } from '../execution-policy/index.ts'
import { InMemoryDispatchStore, type DispatchStore } from './dispatch-store.ts'
import { fingerprintRepairPlan } from './approval-continuation.ts'
import { apiCompatibleActions, browserCompatibleActions, dispatcherAuditSchemaVersion, executorSchemaVersion, isExecutorKind, manualCompatibleActions, type DispatchAuditEvent, type DispatchAuditEventType, type DispatchAuditSink, type ExecutorKind, type SupervisorDispatchRequest, type SupervisorExecutorResult } from './executor-types.ts'

const secretPattern = /(secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key|bearer\s+[a-z0-9._-]+)/i
const secretReplacePattern = /(secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key|bearer\s+[a-z0-9._-]+)/gi
let counter = 0
function now() { return new Date().toISOString() }
function id() { counter += 1; return `dispatch-audit-${Date.now()}-${counter}` }
export function sanitizeDispatchValue<T>(value: T): SerializableValue {
  const scrub = (v: unknown): SerializableValue => {
    if (v == null || typeof v === 'boolean') return v as SerializableValue
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string') return v.replace(secretReplacePattern, '[redacted]')
    if (Array.isArray(v)) return v.map(scrub)
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [secretPattern.test(k) ? 'redacted' : k, scrub(val)])) as SerializableValue
    return '[non-serializable]'
  }
  return scrub(value)
}
function payload(input: Record<string, unknown>): Record<string, SerializableValue> { const out = sanitizeDispatchValue(input); return isPlainSerializable(out) && !Array.isArray(out) ? out as Record<string, SerializableValue> : { summary: 'non-serializable payload omitted' } }
function fail(dispatchId: string, kind: ExecutorKind, message: string, executed: string[] = [], skipped: string[] = []): SupervisorExecutorResult { const t = now(); return { dispatchId, executorKind: kind, status: 'failed', startedAt: t, completedAt: t, executedStepIds: executed, skippedStepIds: skipped, evidence: [{ evidenceId: `${dispatchId}-failure`, type: 'dispatcher_failure', summary: 'Dispatch failed closed.' }], error: { code: 'dispatch_failed', message: message.replace(secretReplacePattern, '[redacted]') }, schemaVersion: executorSchemaVersion } }
function steps(plan: RepairPlan, ids: string[]) { const byId = new Map(plan.steps.map(s => [s.stepId, s])); return ids.map(id => byId.get(id)).filter(Boolean) as RepairStep[] }
function hasMixed(plan: RepairPlan) { const hasBrowser = plan.steps.some(s => ['navigate','click','fill','select','screenshot'].includes(s.action)); const hasApi = plan.steps.some(s => s.action === 'api_request'); return hasBrowser && hasApi }
function planEndsManual(plan: RepairPlan, policy: PolicyDecision) { const last = plan.steps.at(-1); return policy.reason.toLowerCase().includes('human') || policy.reason.toLowerCase().includes('manual') || last?.action === 'request_approval' || (plan.steps.every(s => s.action === 'stop' || s.action === 'request_approval')) }
export function assertPlanCompatible(plan: RepairPlan, approved: RepairStep[], kind: ExecutorKind, policy: PolicyDecision): void {
  if (hasMixed(plan)) throw new DispatchValidationError('Mixed API/browser plans fail closed for Sprint 14.')
  if (kind === 'api') {
    if (plan.requiresBrowser) throw new DispatchValidationError('Browser-required plans cannot route to API executor.')
    if (!approved.every(s => apiCompatibleActions.has(s.action))) throw new DispatchValidationError('Plan contains non-API executable content.')
  } else if (kind === 'browser') {
    if (!plan.requiresBrowser) throw new DispatchValidationError('API-only plans cannot route to browser executor without explicit support.')
    if (!plan.targetOrigin) throw new DispatchValidationError('Browser executor requires targetOrigin.')
    new URL(plan.targetOrigin)
    if (!approved.every(s => browserCompatibleActions.has(s.action))) throw new DispatchValidationError('Plan contains non-browser executable content.')
  } else if (kind === 'manual') {
    if (!planEndsManual(plan, policy) || !approved.every(s => manualCompatibleActions.has(s.action))) throw new DispatchValidationError('Manual executor accepts only manual-review or stop-style plans.')
  }
}
export function validateExecutorResult(result: SupervisorExecutorResult, dispatchId: string, kind: ExecutorKind, approvedStepIds: string[]): void {
  if (!result || typeof result !== 'object') throw new DispatchValidationError('Executor result must be an object')
  if (result.dispatchId !== dispatchId || result.executorKind !== kind || result.schemaVersion !== executorSchemaVersion) throw new DispatchValidationError('Executor result metadata mismatch')
  if (!['not_implemented','dry_run_ready','paused_for_approval','completed','failed','rejected'].includes(result.status)) throw new DispatchValidationError('Executor result status is unsupported')
  if (Number.isNaN(Date.parse(result.startedAt)) || Number.isNaN(Date.parse(result.completedAt))) throw new DispatchValidationError('Executor result timestamps are invalid')
  const approved = new Set(approvedStepIds)
  for (const sid of result.executedStepIds) if (!approved.has(sid)) throw new DispatchValidationError('Executor reported unapproved step')
  if (!isPlainSerializable(result as unknown)) throw new DispatchValidationError('Executor result must be serializable')
}
export interface SupervisorDispatcherDeps { registry: ExecutorRegistry; audit: DispatchAuditSink; dispatchStore?: DispatchStore }
export class SupervisorDispatcher {
  private readonly deps: SupervisorDispatcherDeps
  private defaultStore?: DispatchStore
  constructor(deps: SupervisorDispatcherDeps) { this.deps = deps }
  private get store(): DispatchStore { if (this.deps.dispatchStore) return this.deps.dispatchStore; if (!this.defaultStore) this.defaultStore = new InMemoryDispatchStore(); return this.defaultStore }
  async dispatch(raw: SupervisorDispatchRequest): Promise<SupervisorExecutorResult> {
    const kind = isExecutorKind(raw.requestedExecutorKind) ? raw.requestedExecutorKind : 'manual'
    try { await this.audit(raw, 'dispatch_requested', { requestedExecutorKind: raw.requestedExecutorKind, approvedStepIds: raw.approvedStepIds, approvalContinuationPresented: Boolean(raw.approvalContinuation), approvalContinuationKeyId: raw.approvalContinuation?.keyId, approvalPlanFingerprint: raw.approvalContinuation?.planFingerprint, previousAuditEventId: raw.approvalContinuation?.previousAuditEventId }) } catch (e) { return fail(raw.dispatchId || 'unknown', kind, `Audit failed before execution: ${e instanceof Error ? e.message : 'unknown'}`) }
    try {
      const request = this.validate(raw)
      const planFingerprint = fingerprintRepairPlan(request.plan)
      if (request.executionDecision && request.coordinationStore) {
        await request.coordinationStore.assertFence(request.executionDecision.workItemId, { leaseId: request.executionDecision.auditMetadata.leaseId as string || `lease-${request.executionDecision.workItemId}-${request.executionDecision.fencingToken}`, ownerInstanceId: request.executionDecision.ownerInstanceId, ownerRuntimeId: request.executionDecision.ownerRuntimeId, fencingToken: request.executionDecision.fencingToken })
        await this.audit(raw, 'dispatch_fenced', { workItemId: request.executionDecision.workItemId, fencingToken: request.executionDecision.fencingToken, planFingerprint })
      }
      let executor
      try { executor = this.deps.registry.resolve(request.requestedExecutorKind) } catch (e) { await this.audit(raw, 'executor_missing', { reason: e instanceof Error ? e.message : 'missing', planFingerprint }); throw e }
      const claimed = await this.store.claim({
        dispatchId: request.dispatchId,
        incidentId: request.incident.incidentId,
        executorKind: request.requestedExecutorKind,
        claimedAt: now(),
        workItemId: request.executionDecision?.workItemId,
        executionId: request.executionContext.executionId,
      })
      if (!claimed) { await this.audit(raw, 'duplicate_dispatch_rejected', { dispatchId: request.dispatchId, planFingerprint }); throw new DispatchValidationError('Duplicate dispatchId rejected.') }
      await this.audit(raw, 'dispatch_started', { executorKind: request.requestedExecutorKind, approvedStepIds: request.approvedStepIds, approvalContinuationPresented: Boolean(request.approvalContinuation), planId: request.plan.planId, planFingerprint })
      let result: SupervisorExecutorResult
      try { result = await executor.execute({ incident: request.incident, plan: request.plan, approvedStepIds: [...request.approvedStepIds], executionContext: request.executionContext, dispatch: { dispatchId: request.dispatchId, requestedExecutorKind: request.requestedExecutorKind, requestedAt: now() }, approvalContinuation: request.approvalContinuation }) } catch (e) { result = fail(request.dispatchId, request.requestedExecutorKind, e instanceof Error ? e.message : 'Executor exception', [], request.approvedStepIds) }
      try { validateExecutorResult(result, request.dispatchId, request.requestedExecutorKind, request.approvedStepIds) } catch (e) { result = fail(request.dispatchId, request.requestedExecutorKind, e instanceof Error ? e.message : 'Invalid executor result', [], request.approvedStepIds) }
      await this.audit(raw, result.status === 'failed' || result.status === 'rejected' ? 'dispatch_failed' : 'dispatch_completed', { status: result.status, planId: request.plan.planId, planFingerprint, approvedStepIds: request.approvedStepIds, executedStepIds: result.executedStepIds, skippedStepIds: result.skippedStepIds, error: result.error?.message })
      return result
    } catch (e) { try { await this.audit(raw, e instanceof DispatchValidationError && e.message.includes('Duplicate') ? 'duplicate_dispatch_rejected' : 'dispatch_rejected', { reason: e instanceof Error ? e.message : 'rejected' }) } catch {} return fail(raw.dispatchId || 'unknown', kind, e instanceof Error ? e.message : 'Dispatch rejected') }
  }
  private validate(raw: SupervisorDispatchRequest): SupervisorDispatchRequest & { requestedExecutorKind: ExecutorKind } {
    const incident = incidentSchema.parse(raw.incident); const plan = repairPlanSchema.parse(raw.plan)
    if (plan.incidentId !== incident.incidentId) throw new DispatchValidationError('Plan incidentId mismatch')
    if (raw.policyDecision.outcome !== 'approved') throw new DispatchValidationError('Only approved policy outcomes may dispatch.')
    if (!isExecutorKind(raw.requestedExecutorKind)) throw new ExecutorRegistryError(`Unknown executor kind: ${String(raw.requestedExecutorKind)}`)
    if (!raw.dispatchId || typeof raw.dispatchId !== 'string') throw new DispatchValidationError('dispatchId is required')
    if (!Array.isArray(raw.approvedStepIds) || raw.approvedStepIds.length === 0) throw new DispatchValidationError('Approved step scope must be non-empty.')
    if (new Set(raw.approvedStepIds).size !== raw.approvedStepIds.length) throw new DispatchValidationError('Duplicate approved step IDs rejected.')
    const planIds = new Set(plan.steps.map(s => s.stepId)); for (const sid of raw.approvedStepIds) if (!planIds.has(sid)) throw new DispatchValidationError('Unknown approved step ID rejected.')
    const policyIds = new Set(raw.policyDecision.approvedStepIds); for (const sid of raw.approvedStepIds) if (!policyIds.has(sid)) throw new DispatchValidationError('Unapproved step rejected.')
    if (raw.approvedStepIds.length !== raw.policyDecision.approvedStepIds.length) throw new DispatchValidationError('Approval scope must exactly match policy approvedStepIds.')
    if (raw.approvalContinuation) {
      if (raw.approvalContinuation.dispatchId !== raw.dispatchId) throw new DispatchValidationError('Approval continuation dispatchId mismatch.')
      if (raw.approvalContinuation.incidentId !== incident.incidentId) throw new DispatchValidationError('Approval continuation incidentId mismatch.')
      if (raw.approvalContinuation.planId !== plan.planId) throw new DispatchValidationError('Approval continuation planId mismatch.')
      if (raw.approvalContinuation.planFingerprint !== fingerprintRepairPlan(plan)) throw new DispatchValidationError('Approval continuation plan contents mismatch.')
      if (raw.approvalContinuation.approvedStepIds.length !== raw.approvedStepIds.length || raw.approvalContinuation.approvedStepIds.some((stepId, index) => stepId !== raw.approvedStepIds[index])) throw new DispatchValidationError('Approval continuation scope mismatch.')
    }
    const approved = steps(plan, raw.approvedStepIds); assertPlanCompatible(plan, approved, raw.requestedExecutorKind, raw.policyDecision)
    if (raw.executionDecision) {
      const d = raw.executionDecision
      if (Date.parse(d.expiresAt) <= Date.now()) throw new DispatchValidationError('Execution decision expired.')
      if (d.selectedChannel !== raw.requestedExecutorKind) throw new DispatchValidationError('Decision channel does not match executor.')
      if (d.fencingToken < 1 || !d.ownerInstanceId || !d.ownerRuntimeId) throw new DispatchValidationError('Decision missing ownership fence.')
      if (d.approvedStepIds.length !== raw.approvedStepIds.length || d.approvedStepIds.some((stepId, index) => stepId !== raw.approvedStepIds[index])) throw new DispatchValidationError('Decision approved step scope mismatch.')
      if (raw.requestedExecutorKind === 'api' && d.selectedChannel === 'browser') throw new DispatchValidationError('API decision cannot route to BrowserExecutor.')
      if (raw.requestedExecutorKind === 'browser' && (!d.browserReason || !browserReasons.includes(d.browserReason.reason))) throw new DispatchValidationError('Browser decision requires an accepted browser reason.')
    }
    return { ...raw, incident, plan, requestedExecutorKind: raw.requestedExecutorKind }
  }
  private async audit(raw: Pick<SupervisorDispatchRequest, 'incident'|'dispatchId'>, eventType: DispatchAuditEventType, p: Record<string, unknown>) { const event: DispatchAuditEvent = Object.freeze({ eventId: id(), incidentId: raw.incident?.incidentId || 'unknown', dispatchId: raw.dispatchId || 'unknown', eventType, occurredAt: now(), payload: payload(p), schemaVersion: dispatcherAuditSchemaVersion }); await this.deps.audit.write(event) }
}
