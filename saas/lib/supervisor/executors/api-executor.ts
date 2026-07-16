import { apiCompatibleActions, executorSchemaVersion, type SupervisorExecutor, type SupervisorExecutorInput, type SupervisorExecutorResult } from './executor-types.ts'

function now() { return new Date().toISOString() }
export class APIExecutor implements SupervisorExecutor {
  readonly kind = 'api' as const
  execute(input: SupervisorExecutorInput): SupervisorExecutorResult {
    const startedAt = now()
    const approved = new Set(input.approvedStepIds)
    const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId))
    const invalid = approvedSteps.find(step => !apiCompatibleActions.has(step.action))
    const completedAt = now()
    if (invalid) return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-api-rejected`, type: 'api_stub_rejected', summary: 'API executor rejected a non-API-compatible step.' }], error: { code: 'api_scope_rejected', message: 'Approved scope is not API-compatible.' }, schemaVersion: executorSchemaVersion }
    return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'not_implemented', startedAt, completedAt, executedStepIds: input.approvedStepIds, skippedStepIds: [], evidence: [{ evidenceId: `${input.dispatch.dispatchId}-api-route`, type: 'api_stub_route', summary: 'Sprint 14 routing proof only: API executor would route approved steps without network calls.', data: { planId: input.plan.planId, targetProvider: input.plan.targetProvider, approvedStepIds: input.approvedStepIds } }], schemaVersion: executorSchemaVersion }
  }
}
