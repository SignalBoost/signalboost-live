import type { KnowledgeGap } from './index'
import type { ContinuousLearningCycle, LearningCycleResult } from './cycle'

export type ControlledLearningProgramConfig = {
  enabled: boolean
  maxGapsPerRun: number
  minimumExpectedReuse: number
  minimumExpectedAvoidedCostUsd: number
}

export const DEFAULT_CONTROLLED_LEARNING_PROGRAM: ControlledLearningProgramConfig = {
  // Explicit opt-in prevents deployment from silently creating background API spend.
  enabled: false,
  maxGapsPerRun: 5,
  minimumExpectedReuse: 2,
  minimumExpectedAvoidedCostUsd: 0.05,
}

export type ControlledLearningRun =
  | { status: 'disabled'; selectedGaps: 0 }
  | { status: 'idle'; selectedGaps: 0 }
  | { status: 'completed'; selectedGaps: number; result: LearningCycleResult }

/**
 * Cost-safe entry point for autonomous COS education.
 * Scheduling is intentionally outside this class: deployment alone must never activate
 * background learning. Operators must explicitly enable the program and separately bind
 * a low-frequency scheduler or invoke it on demand.
 */
export class ControlledLearningProgram {
  constructor(
    private readonly cycle: ContinuousLearningCycle,
    private readonly config: ControlledLearningProgramConfig = DEFAULT_CONTROLLED_LEARNING_PROGRAM,
  ) {}

  async run(gaps: KnowledgeGap[], spentExternalCostUsd = 0): Promise<ControlledLearningRun> {
    if (!this.config.enabled) return { status: 'disabled', selectedGaps: 0 }

    const selected = [...gaps]
      .filter((gap) =>
        gap.question.trim() &&
        gap.subject.trim() &&
        gap.expectedReuse >= this.config.minimumExpectedReuse &&
        gap.expectedAvoidedCostUsd >= this.config.minimumExpectedAvoidedCostUsd,
      )
      .sort((a, b) =>
        (b.expectedAvoidedCostUsd * b.expectedReuse + b.urgency / 100) -
        (a.expectedAvoidedCostUsd * a.expectedReuse + a.urgency / 100),
      )
      .slice(0, Math.max(0, Math.floor(this.config.maxGapsPerRun)))

    if (!selected.length) return { status: 'idle', selectedGaps: 0 }
    const result = await this.cycle.run(selected, spentExternalCostUsd)
    return { status: 'completed', selectedGaps: selected.length, result }
  }
}
