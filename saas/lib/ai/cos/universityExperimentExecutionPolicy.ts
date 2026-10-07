// Phase 1: separate automatic intake from a single explicitly authorized experiment.
// This is a pure policy contract, not an execution grant or a pause bypass.
export type UniversityExecutionRequest =
  | Readonly<{ kind: 'automatic' }>
  | Readonly<{ kind: 'experiment'; experimentId: string; organizationId: string; authorizedOrganizationId: string; verifiedByHarness: boolean; budgetReserved: boolean; activeExperimentId: string | null }>

export type UniversityExecutionDecision = 'allow' | 'line_paused' | 'pause_unknown' | 'experiment_not_authorized' | 'experiment_not_reserved' | 'experiment_conflict'

export function decideUniversityExecution(paused: boolean, pauseKnown: boolean, request: UniversityExecutionRequest): UniversityExecutionDecision {
  // Unknown pause state must never silently restart expensive automatic intake.
  if (!pauseKnown) return 'pause_unknown'
  if (request.kind === 'automatic') return paused ? 'line_paused' : 'allow'
  // Explicit experiments require independently verified tenant authority and reserved budget.
  if (!request.verifiedByHarness || !request.experimentId.trim() || !request.organizationId.trim()
    || request.organizationId !== request.authorizedOrganizationId) return 'experiment_not_authorized'
  if (!request.budgetReserved) return 'experiment_not_reserved'
  if (request.activeExperimentId !== null && request.activeExperimentId !== request.experimentId) return 'experiment_conflict'
  return 'allow'
}
