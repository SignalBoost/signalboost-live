import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import { reasoningCopy } from './reasoning-copy.ts'
import type { RemediationStrategy, RewrittenTask } from './types.ts'

const readStep = (id: string, description: string, task: RewrittenTask): RepairStep => ({
  stepId: `reason-${id}`,
  action: 'read',
  description: `${description} (${task.affectedResource})`,
  protectedAction: false,
  parameters: {
    target: task.affectedResource,
    provider: task.provider,
    environment: task.environment,
    shape: task.shape,
  },
})

function assertStrategyStepsSafe(steps: RepairStep[], strategyId: string): void {
  const ids = new Set<string>()
  for (const step of steps) {
    if (ids.has(step.stepId)) throw new Error(`Reasoning strategy ${strategyId} emitted duplicate stepId ${step.stepId}`)
    ids.add(step.stepId)
    if (step.action === 'request_approval') throw new Error(`Reasoning strategy ${strategyId} must not decide approval; policy owns that decision`)
    if (['api_request', 'navigate', 'click', 'fill', 'select'].includes(step.action) && !step.protectedAction) {
      throw new Error(`Reasoning strategy ${strategyId} emitted mutating step ${step.stepId} without protectedAction=true`)
    }
  }
}

export class StepDecomposer {
  decompose(input: { incident: SupervisorIncident; task: RewrittenTask; strategy?: RemediationStrategy; locale?: string | null }): RepairStep[] {
    const diagnostics = reasoningCopy(input.locale).questions[input.task.shape]
      .map(([id, description]) => readStep(id, description, input.task))
    if (!input.strategy) return diagnostics

    const remediation = input.strategy.buildSteps({ incident: input.incident, task: input.task })
    assertStrategyStepsSafe(remediation, input.strategy.strategyId)
    return [...diagnostics, ...remediation]
  }
}
