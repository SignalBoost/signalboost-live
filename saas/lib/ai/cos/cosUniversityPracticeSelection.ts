/** Select from the host-bounded, priority-ordered candidates without spending slots on blocked plans. */
export async function selectEligibleCosUniversityPracticePlans<T>(
  candidates: readonly T[],
  limit: number,
  isEligible: (plan: T) => Promise<boolean>,
): Promise<T[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) return []
  const selected: T[] = []
  for (const plan of candidates) {
    if (!(await isEligible(plan))) continue
    selected.push(plan)
    if (selected.length >= limit) break
  }
  return selected
}
