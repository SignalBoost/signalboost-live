import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RemediationStrategy, RewrittenTask } from './types.ts'

const mutatingActions = new Set<RepairStep['action']>(['api_request', 'navigate', 'click', 'fill', 'select'])

export class VerificationLogic {
  build(input: { incident: SupervisorIncident; task: RewrittenTask; steps: RepairStep[]; strategy?: RemediationStrategy }): RepairStep[] {
    const custom = input.strategy?.buildVerificationSteps?.({ incident: input.incident, task: input.task }) ?? []
    if (custom.length > 0) return custom

    const hasMutation = input.steps.some(step => mutatingActions.has(step.action))
    return [{
      stepId: hasMutation ? 'reason-verify-remediation' : 'reason-verify-observations',
      action: 'verify',
      description: hasMutation
        ? `Verify ${input.task.affectedResource} is healthy after remediation and no adjacent regression is observed`
        : `Confirm the diagnostic observations for ${input.task.affectedResource} were gathered successfully`,
      protectedAction: false,
      parameters: {
        target: input.task.affectedResource,
        provider: input.task.provider,
        environment: input.task.environment,
        shape: input.task.shape,
      },
      expectedResult: hasMutation ? 'target healthy and adjacent checks pass' : 'observations recorded',
    }]
  }
}
