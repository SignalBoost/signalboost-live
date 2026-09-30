// saas/lib/ai/interactiveProviderHedge.ts
//
// ONE STALLED PROVIDER MUST NOT DECIDE A CHAT ANSWER.
//
// Production 2026-09-29: chat questions ended in the generic "narrow the question" reply because chat had
// exactly one provider and it stalled to its full 30s limit. Owner direction: the owned RunPod reasoner is
// primary and the paid managed provider is the backup (see local-inference.ts runpodFirstInteractiveTurn).
//
// This helper runs the primary attempt and, only if it has not produced a useful result after
// `hedgeAfterMs` (or finishes early without one), starts the backup. The first useful result wins. A primary
// that answers in normal time never triggers the backup, so ordinary answers cost exactly one call.
//
// Zero imports so the timing contract is unit-testable without any provider.

export type HedgeOutcome<T> = {
  result: T | null
  winner: 'primary' | 'backup' | 'none'
  backupStarted: boolean
}

export async function firstUsefulWithHedge<T>(input: {
  primary: () => Promise<T | null>
  backup: () => Promise<T | null>
  hedgeAfterMs: number
  isUseful: (value: T | null) => boolean
}): Promise<HedgeOutcome<T>> {
  const hedgeAfterMs = Math.max(0, Number.isFinite(input.hedgeAfterMs) ? input.hedgeAfterMs : 0)
  const safe = (run: () => Promise<T | null>) => run().then(value => value, () => null)

  const primary = safe(input.primary)
  let timer: ReturnType<typeof setTimeout> | null = null
  const hedgeSignal = new Promise<'hedge'>(resolve => { timer = setTimeout(() => resolve('hedge'), hedgeAfterMs) })

  const first = await Promise.race([primary.then(value => ({ value })), hedgeSignal])
  if (first !== 'hedge') {
    if (timer) clearTimeout(timer)
    if (input.isUseful(first.value)) return { result: first.value, winner: 'primary', backupStarted: false }
    // The primary finished early without a usable answer (empty, aborted, error). Try the backup once.
    const fallback = await safe(input.backup)
    return input.isUseful(fallback)
      ? { result: fallback, winner: 'backup', backupStarted: true }
      : { result: first.value ?? fallback ?? null, winner: 'none', backupStarted: true }
  }

  // The primary is still running past the hedge point: race it against the backup.
  const backup = safe(input.backup)
  const tagged = [
    primary.then(value => ({ value, who: 'primary' as const })),
    backup.then(value => ({ value, who: 'backup' as const })),
  ]
  const firstDone = await Promise.race(tagged)
  if (input.isUseful(firstDone.value)) return { result: firstDone.value, winner: firstDone.who, backupStarted: true }
  const other = await (firstDone.who === 'primary' ? tagged[1] : tagged[0])
  if (input.isUseful(other.value)) return { result: other.value, winner: other.who, backupStarted: true }
  return { result: firstDone.value ?? other.value ?? null, winner: 'none', backupStarted: true }
}
