// saas/lib/ai/cos/cosUniversityPracticeDeferralPolicy.ts
/**
 * How many times a practice row may be deferred before it is treated as a real failure.
 *
 * `deferPractice` returns a row to `queued` without consuming an attempt, which is right for a
 * transient outage — a reasoner timeout or a momentary database loss should not spend the learner's
 * budget. It is wrong for a deterministic fault. The Software Specialist's round-1 row cycled on
 * `practice_json_unparseable` every fifteen minutes for hours, producing the same failure each time,
 * consuming a queue slot, and never surfacing as a failed practice anyone would notice.
 *
 * Bounding the deferrals keeps the transient case free while making the permanent case terminal, so
 * the plan can reopen study instead of waiting on a row that will never grade. Nothing here changes
 * how practice is scored: a deferral is still not an attempt, and the ceiling only decides when to
 * stop retrying.
 */

export const MAX_PRACTICE_DEFERRALS = 6

/** Deferral counter carried in the queue row's metadata; absent or malformed reads as zero. */
export function practiceDeferralCount(metadata: Record<string, unknown> | null | undefined): number {
  const raw = Number((metadata ?? {}).practiceDeferrals)
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

export type PracticeDeferralDecision = Readonly<{
  /** `true` when the row should go back to `queued`; `false` when it has exhausted its deferrals. */
  retry: boolean
  deferrals: number
  reason: string
}>

/**
 * Decides whether one more deferral is allowed. The recorded reason keeps the original cause and
 * appends the exhausted count, so the terminal row still says what actually went wrong rather than
 * only that it gave up.
 */
export function decidePracticeDeferral(input: {
  metadata: Record<string, unknown> | null | undefined
  reason: string
  max?: number
}): PracticeDeferralDecision {
  const ceiling = Math.max(1, Math.floor(input.max ?? MAX_PRACTICE_DEFERRALS))
  const deferrals = practiceDeferralCount(input.metadata) + 1
  const reason = String(input.reason ?? '').trim() || 'practice_deferred'
  if (deferrals < ceiling) return { retry: true, deferrals, reason }
  return { retry: false, deferrals, reason: `${reason} (deferred ${deferrals} times, no longer retrying)` }
}

/** Metadata to write back, preserving every other key the host put on the row. */
export function practiceDeferralMetadata(
  metadata: Record<string, unknown> | null | undefined,
  deferrals: number,
): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  return { ...base, practiceDeferrals: Math.max(0, Math.floor(deferrals)) }
}
