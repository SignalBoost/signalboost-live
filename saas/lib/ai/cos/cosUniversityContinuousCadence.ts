export const COS_UNIVERSITY_CONTINUOUS_SWEEP_MINUTES = 15
export const COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES = 60

export type CosUniversityContinuousPlanState = {
  id: string
  status: string
  lastAttemptAt: string | null
}

export function cosUniversityContinuousSlotKey(now = new Date()): string {
  const value = new Date(now)
  const minutes = value.getUTCMinutes()
  const bucket = Math.floor(minutes / COS_UNIVERSITY_CONTINUOUS_SWEEP_MINUTES) * COS_UNIVERSITY_CONTINUOUS_SWEEP_MINUTES
  value.setUTCMinutes(bucket, 0, 0)
  return value.toISOString().slice(0, 16)
}

export function cosUniversityPlanEligibleForContinuousStudy(
  plan: CosUniversityContinuousPlanState,
  now = new Date(),
  cooldownMinutes = COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES,
): boolean {
  if (plan.status === 'completed' || plan.status === 'superseded' || plan.status === 'ready_for_exam') return false
  if (!plan.lastAttemptAt) return true
  const attemptedAt = Date.parse(plan.lastAttemptAt)
  if (!Number.isFinite(attemptedAt)) return true
  const cooldownMs = Math.max(1, Math.floor(cooldownMinutes)) * 60_000
  return now.getTime() - attemptedAt >= cooldownMs
}
