import { executorSchemaVersion, manualCompatibleActions, type SupervisorExecutor, type SupervisorExecutorInput, type SupervisorExecutorResult } from './executor-types.ts'
function now() { return new Date().toISOString() }
export class ManualExecutor implements SupervisorExecutor {
  readonly kind = 'manual' as const
  execute(input: SupervisorExecutorInput): SupervisorExecutorResult {
    const startedAt = now(); const approved = new Set(input.approvedStepIds); const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId)); const invalid = approvedSteps.find(step => !manualCompatibleActions.has(step.action)); const completedAt = now()
    if (invalid) return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'rejected', startedAt, completedAt, executedStepIds: [], skippedStepIds: input.approvedStepIds, evidence: [{ evidenceId: `${input.dispatch.dispatchId}-manual-rejected`, type: 'manual_route_rejected', summary: 'Manual executor rejected non-manual executable repair steps.' }], error: { code: 'manual_scope_rejected', message: 'Approved scope is not manual-routing compatible.' }, schemaVersion: executorSchemaVersion }
    return { dispatchId: input.dispatch.dispatchId, executorKind: this.kind, status: 'completed', startedAt, completedAt, executedStepIds: input.approvedStepIds, skippedStepIds: [], evidence: [{ evidenceId: `${input.dispatch.dispatchId}-manual-route`, type: 'manual_review_route', summary: 'Incident routed to human review. No remediation was performed and no resolution is asserted.', data: { planId: input.plan.planId, incidentId: input.incident.incidentId } }], schemaVersion: executorSchemaVersion }
  }
}
