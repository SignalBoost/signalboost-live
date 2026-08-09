export type LearningObservation = {
  taskId: string
  capability: string
  strategy: string
  succeeded: boolean
  latencyMs: number
  externalCostUsd: number
  reusable: boolean
}

export type LearnedStrategy = {
  capability: string
  strategy: string
  score: number
  observations: number
}

export interface LearningStore {
  observe(observation: LearningObservation): Promise<void>
  bestStrategy(taskId: string, capability: string): Promise<LearnedStrategy | null>
}

/** COS learns outcomes, never provider-specific behavior. */
export class LearningEngine {
  constructor(private readonly store: LearningStore) {}

  observe(observation: LearningObservation) {
    return this.store.observe(observation)
  }

  recommend(taskId: string, capability: string) {
    return this.store.bestStrategy(taskId, capability)
  }
}
