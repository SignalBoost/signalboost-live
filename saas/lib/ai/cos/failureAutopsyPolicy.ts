// Pure policy helpers for COS failure-autopsy retests.
// No model calls, no database access, and no hidden reasoning state.

export type FailureAutopsyRetestCandidate = {
  id: string
  domain: string
  problemClass: string
}

export type FailureAutopsyRetestTarget = {
  problemClass: string
  sourceCaseId?: string | null
  attemptedCaseIds?: readonly string[]
}

/**
 * Select a DIFFERENT controlled case for a shadow retest.
 *
 * Prefer the same benchmark domain as the source failure when that source case is known. Otherwise
 * use the same bounded COS problem class. Never reuse the source case or a case already tried for
 * this autopsy: a same-case rerun is not independent evidence that the failure stopped recurring.
 */
export function selectFailureAutopsyRetestCase(
  target: FailureAutopsyRetestTarget,
  candidates: readonly FailureAutopsyRetestCandidate[],
): FailureAutopsyRetestCandidate | null {
  const sourceCaseId = String(target.sourceCaseId || '')
  const attempted = new Set((target.attemptedCaseIds ?? []).map(String))
  if (sourceCaseId) attempted.add(sourceCaseId)

  const source = sourceCaseId ? candidates.find(candidate => candidate.id === sourceCaseId) : null
  if (source) {
    const sameDomain = candidates.find(candidate => candidate.domain === source.domain && !attempted.has(candidate.id))
    if (sameDomain) return sameDomain
  }

  const problemClass = String(target.problemClass || '').trim().toLowerCase()
  const sameClass = candidates.find(candidate =>
    candidate.problemClass.trim().toLowerCase() === problemClass && !attempted.has(candidate.id),
  )
  return sameClass ?? null
}

export function retainedLessonAfterRetest(passed: boolean): boolean {
  return passed === true
}
