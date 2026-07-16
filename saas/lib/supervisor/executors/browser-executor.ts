import { browserCompatibleActions, executorSchemaVersion, type SupervisorExecutor, type SupervisorExecutorInput, type SupervisorExecutorResult } from './executor-types.ts'
import { BrowserRuntimeDryRunAdapter } from './browser/browser-runtime-adapter.ts'
import { BrowserRuntimeAdapterError } from './browser/browser-runtime-adapter-errors.ts'

function now() { return new Date().toISOString() }

export class BrowserExecutor implements SupervisorExecutor {
  readonly kind = 'browser' as const
  private readonly adapter: BrowserRuntimeDryRunAdapter
  private readonly clock: () => Date
  constructor(deps: { adapter?: BrowserRuntimeDryRunAdapter; clock?: () => Date } = {}) { this.adapter = deps.adapter ?? new BrowserRuntimeDryRunAdapter(); this.clock = deps.clock ?? (() => new Date()) }
  execute(input: SupervisorExecutorInput): SupervisorExecutorResult {
    const startedAt = now()
    const approved = new Set(input.approvedStepIds)
    const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId))
    const invalid = approvedSteps.find(step => !browserCompatibleActions.has(step.action))
    if (input.dispatch.requestedExecutorKind !== 'browser') return this.rejected(input, startedAt, 'browser_executor_kind_mismatch', 'Browser executor received a non-browser dispatch.')
    if (invalid) return this.rejected(input, startedAt, 'browser_scope_rejected', 'Approved scope is not browser-compatible.')
    try {
      const dryRunPackage = this.adapter.createPackage({ incident: input.incident, repairPlan: input.plan, approvedStepIds: input.approvedStepIds, dispatch: input.dispatch, requestedExecutorKind: 'browser', clock: this.clock })
      const completedAt = now()
      return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'dry_run_ready', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-dry-run-ready`, type: 'browser_runtime_dry_run_package', summary: 'Browser Runtime dry-run package was constructed and validated. No browser was launched and no repair steps were executed.', data: dryRunPackage as unknown as Record<string, never> }], schemaVersion: executorSchemaVersion }
    } catch (error) {
      const completedAt = now(); const code = error instanceof BrowserRuntimeAdapterError ? error.code : 'browser_package_rejected'
      return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-package-rejected`, type: 'browser_package_rejected', summary: 'Browser Runtime dry-run package creation failed closed.', data: { code } }], error: { code, message: error instanceof Error ? error.message : 'Browser Runtime dry-run package creation failed closed.' }, schemaVersion: executorSchemaVersion }
    }
  }
  private rejected(input: SupervisorExecutorInput, startedAt: string, code: string, message: string): SupervisorExecutorResult { const completedAt = now(); return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-rejected`, type: 'browser_package_rejected', summary: message }], error: { code, message }, schemaVersion: executorSchemaVersion } }
}
