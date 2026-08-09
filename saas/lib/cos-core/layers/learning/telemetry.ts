import type { LearningCycleResult } from './cycle'

export type ContinuousLearningMetric = LearningCycleResult & {
  startedAt: string
  completedAt: string
  durationMs: number
}

export interface ContinuousLearningTelemetrySink {
  record(metric: ContinuousLearningMetric): Promise<void>
}

export async function runLearningCycleWithTelemetry(
  run: () => Promise<LearningCycleResult>,
  sink: ContinuousLearningTelemetrySink,
): Promise<LearningCycleResult> {
  const started = new Date()
  const result = await run()
  const completed = new Date()
  await sink.record({
    ...result,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: completed.getTime() - started.getTime(),
  })
  return result
}
