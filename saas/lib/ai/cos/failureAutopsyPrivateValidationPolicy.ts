export type FailureAutopsyPrivateCase = {
  id: string
  problemClass: string
}

export type FailureAutopsyPrivateValidationEvidence = {
  caseId: string
  success: boolean
  observedAt: string
}

export const FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_ATTEMPTS = 3
export const FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_RATE = 0.8

function clean(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function time(value: unknown): number {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function selectUnusedPrivateHoldoutCase<T extends FailureAutopsyPrivateCase>(args: {
  cases: readonly T[]
  problemClass: string
  priorCaseIds: readonly string[]
}): T | null {
  const wanted = clean(args.problemClass)
  const used = new Set(args.priorCaseIds.map(String))
  return args.cases.find(test => clean(test.problemClass) === wanted && !used.has(String(test.id))) ?? null
}

export function summarizePrivateHoldoutEvidence(
  rows: readonly FailureAutopsyPrivateValidationEvidence[],
  since?: string | null,
): {
  attempts: number
  successes: number
  failures: number
  distinctCases: number
  successRate: number | null
  eligible: boolean
  latestSuccessAt: string | null
} {
  const cutoff = since ? time(since) : 0
  const latestByCase = new Map<string, FailureAutopsyPrivateValidationEvidence>()
  for (const row of rows) {
    const caseId = String(row.caseId || '').trim()
    if (!caseId || time(row.observedAt) <= cutoff) continue
    const prior = latestByCase.get(caseId)
    if (!prior || time(row.observedAt) >= time(prior.observedAt)) latestByCase.set(caseId, row)
  }
  const selected = [...latestByCase.values()]
  const attempts = selected.length
  const successes = selected.filter(row => row.success).length
  const failures = attempts - successes
  const successRate = attempts ? successes / attempts : null
  const latestSuccess = selected.filter(row => row.success).sort((a, b) => time(b.observedAt) - time(a.observedAt))[0]
  return {
    attempts,
    successes,
    failures,
    distinctCases: attempts,
    successRate,
    eligible: attempts >= FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_ATTEMPTS
      && successRate != null
      && successRate >= FAILURE_AUTOPSY_PRIVATE_HOLDOUT_MIN_RATE,
    latestSuccessAt: latestSuccess?.observedAt ?? null,
  }
}
