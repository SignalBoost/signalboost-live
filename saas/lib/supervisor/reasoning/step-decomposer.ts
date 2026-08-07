import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RemediationStrategy, RewrittenTask } from './types.ts'

const DIAGNOSTIC_QUESTIONS: Record<RewrittenTask['shape'], Array<[string, string]>> = {
  availability: [
    ['confirm-current-health', 'Confirm the affected resource is still unavailable'],
    ['inspect-dependencies', 'Inspect immediate dependency health'],
    ['inspect-recent-change', 'Inspect the most recent deployment or configuration change'],
  ],
  deployment: [
    ['inspect-deployment', 'Inspect the current deployment or rollout state'],
    ['inspect-failure-evidence', 'Inspect the first failing build or rollout evidence'],
    ['compare-previous', 'Compare against the previously healthy revision'],
  ],
  saturation: [
    ['confirm-saturation', 'Confirm the constrained resource is still saturated'],
    ['inspect-trend', 'Inspect recent utilization trend'],
    ['identify-consumer', 'Identify the largest workload or tenant consumer'],
  ],
  latency: [
    ['confirm-latency', 'Confirm the reported latency is still elevated'],
    ['locate-slow-path', 'Locate the slow endpoint or operation'],
    ['inspect-dependencies', 'Inspect downstream dependency latency'],
  ],
  errors: [
    ['confirm-error-rate', 'Confirm the reported error rate is still elevated'],
    ['sample-errors', 'Inspect representative failures for the dominant error'],
    ['inspect-recent-change', 'Inspect the most recent deployment or configuration change'],
  ],
  data_freshness: [
    ['confirm-freshness', 'Confirm the data is still stale'],
    ['inspect-producer', 'Inspect the producer or scheduled job health'],
    ['inspect-queue', 'Inspect queue depth and oldest-message age'],
  ],
  unclassified: [
    ['inspect-resource', 'Inspect the current state of the affected resource'],
    ['inspect-events', 'Inspect recent events around the incident time'],
  ],
}

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
  decompose(input: { incident: SupervisorIncident; task: RewrittenTask; strategy?: RemediationStrategy }): RepairStep[] {
    const diagnostics = DIAGNOSTIC_QUESTIONS[input.task.shape].map(([id, description]) => readStep(id, description, input.task))
    if (!input.strategy) return diagnostics

    const remediation = input.strategy.buildSteps({ incident: input.incident, task: input.task })
    assertStrategyStepsSafe(remediation, input.strategy.strategyId)
    return [...diagnostics, ...remediation]
  }
}
