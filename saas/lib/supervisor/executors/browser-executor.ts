import { browserCompatibleActions, executorSchemaVersion, type SupervisorExecutor, type SupervisorExecutorInput, type SupervisorExecutorResult } from './executor-types.ts'
import { BrowserRuntimeDryRunAdapter } from './browser/browser-runtime-adapter.ts'
import { BrowserRuntimeAdapterError } from './browser/browser-runtime-adapter-errors.ts'
import { SandboxExecutionAdapter, type SandboxExecutionAdapterDeps } from './browser/sandbox-execution-adapter.ts'
import { sandboxBrowserExecutionSchemaVersion } from './browser/sandbox-execution-schema.ts'

function now() { return new Date().toISOString() }

export class BrowserExecutor implements SupervisorExecutor {
  readonly kind = 'browser' as const
  private readonly adapter: BrowserRuntimeDryRunAdapter
  private readonly clock: () => Date
  private readonly sandboxAdapter?: SandboxExecutionAdapter
  constructor(deps: { adapter?: BrowserRuntimeDryRunAdapter; clock?: () => Date; sandbox?: SandboxExecutionAdapter | SandboxExecutionAdapterDeps } = {}) {
    this.adapter = deps.adapter ?? new BrowserRuntimeDryRunAdapter(); this.clock = deps.clock ?? (() => new Date())
    this.sandboxAdapter = deps.sandbox ? (deps.sandbox instanceof SandboxExecutionAdapter ? deps.sandbox : new SandboxExecutionAdapter(deps.sandbox)) : undefined
  }
  execute(input: SupervisorExecutorInput): Promise<SupervisorExecutorResult> | SupervisorExecutorResult {
    const startedAt = now()
    const approved = new Set(input.approvedStepIds)
    const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId))
    const invalid = approvedSteps.find(step => !browserCompatibleActions.has(step.action))
    if (input.dispatch.requestedExecutorKind !== 'browser') return this.rejected(input, startedAt, 'browser_executor_kind_mismatch', 'Browser executor received a non-browser dispatch.')
    if (invalid) return this.rejected(input, startedAt, 'browser_scope_rejected', 'Approved scope is not browser-compatible.')
    const mode = (input.executionContext.metadata as Record<string, unknown> | undefined)?.browserExecutionMode
    if (mode === 'sandbox_execute') return this.executeSandbox(input, startedAt)
    if (mode !== undefined && mode !== 'dry_run') return this.rejected(input, startedAt, 'browser_execution_mode_rejected', 'Browser executor supports only dry_run and sandbox_execute modes.')
    try {
      const dryRunPackage = this.adapter.createPackage({ incident: input.incident, repairPlan: input.plan, approvedStepIds: input.approvedStepIds, dispatch: input.dispatch, requestedExecutorKind: 'browser', clock: this.clock })
      const completedAt = now()
      return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'dry_run_ready', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-dry-run-ready`, type: 'browser_runtime_dry_run_package', summary: 'Browser Runtime dry-run package was constructed and validated. No browser was launched and no repair steps were executed.', data: dryRunPackage as unknown as Record<string, never> }], schemaVersion: executorSchemaVersion }
    } catch (error) {
      const completedAt = now(); const code = error instanceof BrowserRuntimeAdapterError ? error.code : 'browser_package_rejected'
      return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-package-rejected`, type: 'browser_package_rejected', summary: 'Browser Runtime dry-run package creation failed closed.', data: { code } }], error: { code, message: error instanceof Error ? error.message : 'Browser Runtime dry-run package creation failed closed.' }, schemaVersion: executorSchemaVersion }
    }
  }
  private async executeSandbox(input: SupervisorExecutorInput, startedAt: string): Promise<SupervisorExecutorResult> {
    if (!this.sandboxAdapter) return this.rejected(input, startedAt, 'sandbox_adapter_missing', 'Sandbox execution adapter is not configured.')
    const meta = input.executionContext.metadata as Record<string, unknown>
    const request = meta.sandboxExecutionRequest
    const executionId = typeof meta.browserExecutionId === 'string' ? meta.browserExecutionId : undefined
    const sandbox = executionId ? await this.sandboxAdapter.executeContinuation(request, executionId) : await this.sandboxAdapter.execute(request)
    const runtime = sandbox.runtimeResult
    const completedAt = now()
    const status = sandbox.status === 'failed' ? 'failed' : sandbox.status
    return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status, startedAt, completedAt, executedStepIds: runtime?.completedStepIds ?? [], skippedStepIds: input.approvedStepIds.filter(id => !(runtime?.completedStepIds ?? []).includes(id)), evidence: [{ evidenceId: `${input.dispatch.dispatchId}-sandbox-execution`, type: 'sandbox_browser_execution', summary: `Sandbox browser execution ${sandbox.status}.`, data: { schemaVersion: sandboxBrowserExecutionSchemaVersion, auditEvents: sandbox.auditEvents as never, runtimeResult: runtime as never } }], error: sandbox.error, schemaVersion: executorSchemaVersion }
  }
  private rejected(input: SupervisorExecutorInput, startedAt: string, code: string, message: string): SupervisorExecutorResult { const completedAt = now(); return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-browser-rejected`, type: 'browser_package_rejected', summary: message }], error: { code, message }, schemaVersion: executorSchemaVersion } }
}
