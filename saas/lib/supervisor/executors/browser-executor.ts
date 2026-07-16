import { browserCompatibleActions, executorSchemaVersion, type SupervisorExecutor, type SupervisorExecutorInput, type SupervisorExecutorResult } from './executor-types.ts'
function now() { return new Date().toISOString() }
export class BrowserExecutor implements SupervisorExecutor {
  readonly kind = 'browser' as const
  execute(input: SupervisorExecutorInput): SupervisorExecutorResult {
    const startedAt = now(); const approved = new Set(input.approvedStepIds); const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId)); const invalid = approvedSteps.find(step => !browserCompatibleActions.has(step.action)); const completedAt = now()
    if (invalid) return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-rejected`, type: 'browser_stub_rejected', summary: 'Browser executor rejected a non-browser-compatible step.' }], error: { code: 'browser_scope_rejected', message: 'Approved scope is not browser-compatible.' }, schemaVersion: executorSchemaVersion }
    return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'not_implemented', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-disabled`, type: 'browser_stub_disabled', summary: 'Interactive browser execution is disabled for Sprint 14. No runtime adapter code was invoked.', data: { planId: input.plan.planId, targetOrigin: input.plan.targetOrigin ?? null, approvedStepIds: input.approvedStepIds } }], schemaVersion: executorSchemaVersion }
  }
}
