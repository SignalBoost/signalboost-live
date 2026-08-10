import type { ControlledLearningProgramConfig } from './program'

export type LearningTriggerEnvironment = {
  [key: string]: string | undefined
  COS_AUTONOMOUS_LEARNING_ENABLED?: string
  COS_AUTONOMOUS_LEARNING_MAX_GAPS?: string
  COS_AUTONOMOUS_LEARNING_MIN_REUSE?: string
  COS_AUTONOMOUS_LEARNING_MIN_AVOIDED_COST_USD?: string
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Converts explicit operator-controlled environment values into the learning program
 * configuration. Autonomous learning remains off unless the enable flag is exactly true.
 * This gate is deliberately independent of deployment and cron configuration.
 */
export function controlledLearningConfigFromEnvironment(
  env: LearningTriggerEnvironment = process.env,
): ControlledLearningProgramConfig {
  return {
    enabled: env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true',
    maxGapsPerRun: Math.min(10, Math.floor(positiveNumber(env.COS_AUTONOMOUS_LEARNING_MAX_GAPS, 3))),
    minimumExpectedReuse: positiveNumber(env.COS_AUTONOMOUS_LEARNING_MIN_REUSE, 2),
    minimumExpectedAvoidedCostUsd: positiveNumber(
      env.COS_AUTONOMOUS_LEARNING_MIN_AVOIDED_COST_USD,
      0.05,
    ),
  }
}

export function autonomousLearningIsExplicitlyEnabled(
  env: LearningTriggerEnvironment = process.env,
): boolean {
  return env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true'
}
