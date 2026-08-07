import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { FallbackDecision, FailurePrediction, RemediationStrategy, RewrittenTask } from './types.ts'

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

    for (const step of rollbackSteps) {
      if (step.action === 'request_approval') throw new Error('Rollback steps must not decide approval; policy owns that decision')
      if (!step.protectedAction && ['api_request', 'navigate', 'click', 'fill', 'select'].includes(step.action)) {
        throw new Error(`Rollback step ${step.stepId} is mutating and must set protectedAction=true`)
      }
    }

    return { rollbackSteps, requiresRollback: true }
  }
}
