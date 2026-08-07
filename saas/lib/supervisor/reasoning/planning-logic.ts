import type { FailurePrediction, PlanningDecision, RewrittenTask } from './types.ts'

export class PlanningLogic {
  decide(input: { task: RewrittenTask; risk: FailurePrediction; strategyId?: string }): PlanningDecision {
    const recognised = input.task.shape !== 'unclassified'
    const confidenceScore = input.strategyId ? (recognised ? 85 : 70) : (recognised ? 65 : 30)

    const diagnosis = input.strategyId
      ? `The incident matches the ${input.task.shape.replace('_', ' ')} failure shape and registered remediation strategy ${input.strategyId}. The plan begins with bounded diagnostic reads before proposing the strategy's protected remediation steps.`
      : recognised
        ? `The incident matches the ${input.task.shape.replace('_', ' ')} failure shape. No registered remediation strategy matched, so the plan remains diagnostic and does not mutate the target.`
        : `The incident did not match a known failure shape. No remediation strategy matched, so the plan gathers general state and remains read-only.`

    return {
      diagnosis,
      confidenceScore,
      riskLevel: input.risk.overallRiskLevel,
      requiresBrowser: input.risk.requiresBrowser,
    }
  }
}
