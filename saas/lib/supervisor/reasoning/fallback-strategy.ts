import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { FallbackDecision, FailurePrediction, RemediationStrategy, RewrittenTask } from './types.ts'

const mutatingActions = new Set<RepairStep['action']>(['api_request', 'navigate', 'click', 'fill', 'select'])

export class FallbackStrategyHooks {
  build(input: { incident: SupervisorIncident; task: RewrittenTask; risk: FailurePrediction; strategy?: RemediationStrategy }): FallbackDecision {
    if (!input.risk.hasMutation) return { rollbackSteps: [], requiresRollback: false }

    const rollbackSteps = input.strategy?.buildRollbackSteps?.({ incident: input.incident, task: input.task }) ?? []
    if (rollbackSteps.length === 0) {
      return {
        rollbackSteps: [],
        requiresRollback: true,
        failClosedReason: `Registered remediation strategy ${input.strategy?.strategyId ?? 'unknown'} proposed mutation without rollback steps.`,
      }
    }

    const hasActualUndo = rollbackSteps.some(step => mutatingActions.has(step.action))
    if (!hasActualUndo) {
      return {
        rollbackSteps: [],
        requiresRollback: true,
        failClosedReason: `Registered remediation strategy ${input.strategy?.strategyId ?? 'unknown'} proposed mutation without a mutating undo step.`,
      }
    }

    const ids = new Set<string>()
    for (const step of rollbackSteps) {
      if (ids.has(step.stepId)) throw new Error(`Rollback definition contains duplicate stepId ${step.stepId}`)
      ids.add(step.stepId)
      if (step.action === 'request_approval') throw new Error('Rollback steps must not decide approval; policy owns that decision')
      // Rollback is already part of the approved RepairPlan. The rollback coordinator
      // independently gates mutating undo against the buyer's routine_reversible registry
      // and refuses protected steps, so marking undo protected would make automatic
      // rollback impossible by construction.
      if (mutatingActions.has(step.action) && step.protectedAction) {
        throw new Error(`Rollback step ${step.stepId} must not be protected; rollback authority is enforced by the routine_reversible capability registry`)
      }
    }

    return { rollbackSteps, requiresRollback: true }
  }
}
