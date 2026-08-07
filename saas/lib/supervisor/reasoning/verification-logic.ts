import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import { reasoningCopy } from './reasoning-copy.ts'
import type { RemediationStrategy, RewrittenTask } from './types.ts'

const mutatingActions = new Set<RepairStep['action']>(['api_request', 'navigate', 'click', 'fill', 'select'])

export class VerificationLogic {
  build(input: { incident: SupervisorIncident; task: RewrittenTask; steps: RepairStep[]; strategy?: RemediationStrategy; locale?: string | null }): RepairStep[] {
    const custom = input.strategy?.buildVerificationSteps?.({ incident: input.incident, task: input.task }) ?? []
    if (custom.length > 0) return custom

    const hasMutation = input.steps.some(step => mutatingActions.has(step.action))
    const copy = reasoningCopy(input.locale)
    return [{
      stepId: hasMutation ? 'reason-verify-remediation' : 'reason-verify-observations',
      action: 'verify',
      description: hasMutation ? copy.verifyRemediation(input.task.affectedResource) : copy.verifyObservations(input.task.affectedResource),
      protectedAction: false,
      parameters: {
        target: input.task.affectedResource,
        provider: input.task.provider,
        environment: input.task.environment,
        shape: input.task.shape,
      },
      expectedResult: hasMutation ? copy.expectedHealthy : copy.expectedObserved,
    }]
  }
}
