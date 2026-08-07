import { reasoningCopy } from './reasoning-copy.ts'
import type { FailurePrediction, PlanningDecision, RewrittenTask } from './types.ts'

export class PlanningLogic {
  decide(input: { task: RewrittenTask; risk: FailurePrediction; strategyId?: string; locale?: string | null }): PlanningDecision {
    const recognised = input.task.shape !== 'unclassified'
    const confidenceScore = input.strategyId ? (recognised ? 85 : 70) : (recognised ? 65 : 30)
    const copy = reasoningCopy(input.locale)
    const shape = input.task.shape.replace('_', ' ')

    const diagnosis = input.strategyId
      ? copy.diagnosisWithStrategy(shape, input.strategyId)
      : recognised
        ? copy.diagnosisRecognised(shape)
        : copy.diagnosisUnclassified

    return {
      diagnosis,
      confidenceScore,
      riskLevel: input.risk.overallRiskLevel,
      requiresBrowser: input.risk.requiresBrowser,
    }
  }
}
