import type { CognitiveSkillStatus } from '@/lib/ai/cos/cognitiveLearningLifecycle'

export type CognitiveRetentionPolicy = {
  validatedIntervalDays: number
  learnedIntervalDays: number
  masteredIntervalDays: number
  weakenedRetryDays: number
  failuresToWeaken: number
  staleValidationDays: number
}

export const DEFAULT_COGNITIVE_RETENTION_POLICY: CognitiveRetentionPolicy = {
  validatedIntervalDays: 14,
  learnedIntervalDays: 21,
  masteredIntervalDays: 30,
  weakenedRetryDays: 1,
  failuresToWeaken: 2,
  staleValidationDays: 30,
}

export function retentionIntervalDays(
  status: CognitiveSkillStatus,
  policy: CognitiveRetentionPolicy = DEFAULT_COGNITIVE_RETENTION_POLICY,
): number {
  if (status === 'mastered') return policy.masteredIntervalDays
  if (status === 'learned') return policy.learnedIntervalDays
  if (status === 'weakened') return policy.weakenedRetryDays
  return policy.validatedIntervalDays
}

export function nextRetentionDueAt(
  status: CognitiveSkillStatus,
  fromMs = Date.now(),
  policy: CognitiveRetentionPolicy = DEFAULT_COGNITIVE_RETENTION_POLICY,
): string {
  return new Date(fromMs + retentionIntervalDays(status, policy) * 86_400_000).toISOString()
}

export function shouldWeakenAfterRetentionFailure(
  consecutiveFailures: number,
  policy: CognitiveRetentionPolicy = DEFAULT_COGNITIVE_RETENTION_POLICY,
): boolean {
  const failures = Number.isFinite(consecutiveFailures) ? Math.max(0, Math.floor(consecutiveFailures)) : 0
  return failures >= policy.failuresToWeaken
}

export function validationIsStale(
  lastValidatedAt: string | null | undefined,
  nowMs = Date.now(),
  policy: CognitiveRetentionPolicy = DEFAULT_COGNITIVE_RETENTION_POLICY,
): boolean {
  if (!lastValidatedAt) return true
  const parsed = Date.parse(lastValidatedAt)
  if (!Number.isFinite(parsed)) return true
  return nowMs - parsed > policy.staleValidationDays * 86_400_000
}
