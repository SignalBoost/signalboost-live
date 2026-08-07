import type { RepairStep } from '../repair-plan-schema.ts'
import { CognitiveReasoningEngine } from './cognitive-engine.ts'
import type { ReplanInput, ReplanResult } from './types.ts'

const mutatingActions = new Set<RepairStep['action']>(['api_request', 'navigate', 'click', 'fill', 'select'])

export class AdaptiveReplanner {
  constructor(private readonly engine: CognitiveReasoningEngine) {}

  async replan(input: ReplanInput): Promise<ReplanResult> {
    if (input.attempt >= 1) {
      throw new Error('Adaptive replanning is bounded to one retry candidate per failed plan.')
    }
    if (input.verification.status !== 'failed') {
      throw new Error('Adaptive replanning requires an explicit failed verification; unresolved state must be handed to a human.')
    }

    const previousMutated = input.previousPlan.steps.some(step => mutatingActions.has(step.action))
    if (previousMutated && input.rollback?.status !== 'restored') {
      throw new Error('A mutating failed plan must be successfully restored before a new repair candidate can be synthesized.')
    }

    const synthesis = await this.engine.synthesize(input.incident)
    return {
      parentPlanId: input.previousPlan.planId,
      reason: previousMutated
        ? 'Previous repair failed verification and the pre-repair state was restored; synthesized one fresh candidate from current evidence.'
        : 'Previous read-only plan failed verification; synthesized one fresh candidate from current evidence.',
      plan: synthesis.plan,
      trace: synthesis.trace,
    }
  }
}
