// saas/lib/ai/cos/cosUniversityLearningSourceCooldown.ts
/**
 * Cross-cycle memory for learning source adapters.
 *
 * `guardLearningSourceAdapter` already opens a circuit after repeated failures, but the adapters are
 * rebuilt by `createLiveLearningAdapters()` at the top of every cycle, so the breaker's state is
 * discarded within seconds and a permanently dead source is retried in full on the next tick. In
 * production that produced 413 `youtube_metadata` and 180 `gdelt` failures across 190 cycles in one
 * day — roughly every attempt, every cycle, all day.
 *
 * The recorded `source_errors` counters are the only durable memory of those failures, so the
 * cooldown is derived from them. This removes wasted attempts; it changes no admission rule, and a
 * source that stops failing is used again immediately.
 */

export const DEFAULT_SOURCE_FAILURE_STREAK = 4
export const DEFAULT_SOURCE_PROBE_INTERVAL = 8

/** `source_errors` objects from recent completed runs, newest first. */
function failedAdapters(run: unknown): Set<string> {
  const errors = run && typeof run === 'object' && !Array.isArray(run) ? run as Record<string, unknown> : {}
  const failed = new Set<string>()
  for (const [adapter, raw] of Object.entries(errors)) {
    const hits = Number(raw)
    if (Number.isFinite(hits) && hits > 0) failed.add(adapter)
  }
  return failed
}

export function sourceFailureStreaks(runs: readonly unknown[]): ReadonlyMap<string, number> {
  const streaks = new Map<string, number>()
  if (!runs.length) return streaks
  // A streak is consecutive from the newest cycle. An adapter that is working right now has no
  // streak at all, however badly it failed earlier, so recovery is recognised on the next cycle.
  const open = failedAdapters(runs[0])
  for (const adapter of open) streaks.set(adapter, 1)
  for (const run of runs.slice(1)) {
    if (!open.size) break
    const failed = failedAdapters(run)
    for (const adapter of [...open]) {
      if (failed.has(adapter)) streaks.set(adapter, (streaks.get(adapter) ?? 0) + 1)
      else open.delete(adapter)
    }
  }
  return streaks
}

/**
 * A probe slot lets a cooled-down source try again on a fixed cadence, so recovery is detected
 * without a deploy. Derived from the run window rather than a counter, so concurrent lanes agree.
 */
export function isSourceProbeCycle(slotKey: string, interval = DEFAULT_SOURCE_PROBE_INTERVAL): boolean {
  const bounded = Math.max(2, Math.floor(interval))
  let hash = 0
  for (const character of String(slotKey || '')) hash = (hash * 31 + character.charCodeAt(0)) % 1_000_003
  return hash % bounded === 0
}

/**
 * Adapter ids to skip this cycle. Empty on a probe cycle, so nothing is ever excluded permanently.
 */
export function cooledDownSourceIds(input: {
  runs: readonly unknown[]
  slotKey: string
  streakThreshold?: number
  probeInterval?: number
}): ReadonlySet<string> {
  if (isSourceProbeCycle(input.slotKey, input.probeInterval)) return new Set()
  const threshold = Math.max(2, Math.floor(input.streakThreshold ?? DEFAULT_SOURCE_FAILURE_STREAK))
  const cooled = new Set<string>()
  for (const [adapter, streak] of sourceFailureStreaks(input.runs)) {
    if (streak >= threshold) cooled.add(adapter)
  }
  return cooled
}

export type CooldownCandidateAdapter = Readonly<{ kind: string; id?: string }>

/**
 * Filters the cycle's adapters. If every adapter is cooled down the list is returned untouched:
 * acquiring from a failing source is still better than acquiring from none.
 */
export function withoutCooledDownSources<T extends CooldownCandidateAdapter>(
  adapters: readonly T[],
  cooled: ReadonlySet<string>,
): T[] {
  if (!cooled.size) return [...adapters]
  const kept = adapters.filter(adapter => !cooled.has(adapter.id ?? adapter.kind))
  return kept.length ? kept : [...adapters]
}
