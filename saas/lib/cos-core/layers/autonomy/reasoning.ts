import type { LearningEngine, LearnedStrategy } from '../learning'

export type LocalReasoningTask = {
  taskId: string
  objective: string
  capability: string
  context?: string[]
  knownSteps?: string[]
  risk?: 'low' | 'medium' | 'high'
}

export type LocalReasoningPlan = {
  mode: 'local' | 'escalate'
  confidence: number
  reason: string
  steps: string[]
  strategy?: string
}

export type LocalReasoningPolicy = {
  escalationThreshold: number
  minimumKnownSteps: number
}

export const DEFAULT_LOCAL_REASONING_POLICY: LocalReasoningPolicy = {
  escalationThreshold: 0.62,
  minimumKnownSteps: 1,
}

function cleanStep(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function deterministicSteps(task: LocalReasoningTask): string[] {
  const supplied = (task.knownSteps ?? []).map(cleanStep).filter(Boolean)
  if (supplied.length) return supplied

  const objective = cleanStep(task.objective)
  if (!objective) return []

  return [
    `Inspect existing COS knowledge for: ${objective}`,
    `Select the lowest-cost approved capability for: ${task.capability}`,
    `Prepare a governed plan for: ${objective}`,
    `Define verification criteria for: ${objective}`,
    `Record the eventual outcome for future reuse`,
  ]
}

function confidenceFor(task: LocalReasoningTask, strategy: LearnedStrategy | null, steps: string[]): number {
  let score = 0.35
  if (steps.length > 0) score += 0.2
  if ((task.context ?? []).filter(Boolean).length > 0) score += 0.1
  if (strategy) score += Math.min(0.25, Math.max(0, strategy.score) * 0.25)
  if (task.risk === 'high') score -= 0.2
  else if (task.risk === 'medium') score -= 0.08
  return Math.max(0, Math.min(1, score))
}

/** Planning-only, model-optional COS reasoning. This layer never calls a provider. */
export class LocalReasoningDirector {
  constructor(
    private readonly learning: LearningEngine,
    private readonly policy: LocalReasoningPolicy = DEFAULT_LOCAL_REASONING_POLICY,
  ) {}

  async plan(task: LocalReasoningTask): Promise<LocalReasoningPlan> {
    const steps = deterministicSteps(task)
    const strategy = await this.learning.recommend(task.taskId, task.capability)
    const confidence = confidenceFor(task, strategy, steps)
    const enoughStructure = steps.length >= this.policy.minimumKnownSteps
    const local = enoughStructure && confidence >= this.policy.escalationThreshold

    return {
      mode: local ? 'local' : 'escalate',
      confidence,
      strategy: strategy?.strategy,
      steps,
      reason: local
        ? strategy
          ? 'Known strategy and deterministic plan meet the local-confidence threshold.'
          : 'Deterministic plan meets the local-confidence threshold without a provider.'
        : 'Local confidence is below the governed escalation threshold.',
    }
  }

  async recordOutcome(input: {
    task: LocalReasoningTask
    strategy: string
    succeeded: boolean
    latencyMs: number
    externalCostUsd?: number
  }): Promise<void> {
    await this.learning.observe({
      taskId: input.task.taskId,
      capability: input.task.capability,
      strategy: input.strategy,
      succeeded: input.succeeded,
      latencyMs: input.latencyMs,
      externalCostUsd: input.externalCostUsd ?? 0,
      reusable: true,
    })
  }
}
