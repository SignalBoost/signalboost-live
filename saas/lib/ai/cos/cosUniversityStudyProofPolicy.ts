function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function acceptedAtMs(value: unknown): number | null {
  const parsed = Date.parse(clean(value, 100))
  return Number.isFinite(parsed) ? parsed : null
}

function remediationBoundaryMs(evidence: Record<string, unknown>, currentAttempt: number): number | null {
  const remediation = asRecord(evidence.practiceRemediation)
  if (remediation.requiresNewStudyAttempt !== true || Number(remediation.practiceRound) !== currentAttempt) return null
  const requestedAt = Date.parse(clean(remediation.requestedAt, 100))
  return Number.isFinite(requestedAt) ? requestedAt : Number.POSITIVE_INFINITY
}

/**
 * Academic study may advance the current plan only when the governed learning cycle started strictly
 * after every already-recorded causal boundary for that plan. This prevents both pre-remediation
 * evidence and a delayed older learning cycle from being relabeled as a newer study attempt.
 * Timestamp ties fail closed.
 */
export function cosUniversityAcceptedStudyClearsRemediationBoundary(input: {
  evidence: unknown
  currentAttempt: number
  acceptedAt: string
  lastAttemptAt?: string | null
}): boolean {
  const timestampMs = acceptedAtMs(input.acceptedAt)
  if (timestampMs === null) return false
  const lastAttemptMs = input.lastAttemptAt ? acceptedAtMs(input.lastAttemptAt) : null
  if (lastAttemptMs !== null && timestampMs <= lastAttemptMs) return false
  const currentAttempt = Math.max(0, Math.floor(Number(input.currentAttempt || 0)))
  const boundaryMs = remediationBoundaryMs(asRecord(input.evidence), currentAttempt)
  return boundaryMs === null || timestampMs > boundaryMs
}
