// saas/lib/ai/cos/cosUniversityStudyVariant.ts
/**
 * `universityStudyGapSignal` and `platformLanguageStudyGapSignal` both rotate their study themes by
 * `studyVariant` and build the acquisition query from the first two themes of that rotation. Neither
 * of the two producers that actually run the continuous lane — `cosUniversityStore` and the Master's
 * learning runner — ever passed the argument. It defaulted to 0, the rotation offset was therefore
 * always 0, and every gap for a given subject issued the SAME discovery query for the life of the
 * deployment. Only the remediation path (15-minute window) varied at all.
 *
 * Observed consequence: Computer Science retrieved 443 documents across 22 gaps in a two-hour window
 * and accepted none — 172 of the rejections were duplicates, because five sources were being asked
 * one unchanging question and kept returning the same best answers to it.
 *
 * The variant here moves along two independent axes so concurrent plans do not collide and the
 * curriculum still advances over a day:
 *   - a stable hash of the plan key, so two plans running in the same minute ask different questions
 *   - a coarse time window, so a plan retried tomorrow does not repeat today's query
 *
 * The window is deliberately an hour rather than minutes: acquisition needs to sit on one phrasing
 * long enough for saturation to be real information rather than an artefact of asking too fast.
 *
 * Nothing here invents vocabulary. It only changes WHICH of the already-authored curriculum themes a
 * given gap leads with, and it cannot reach outside `subject.studyThemes`.
 */

/** Length of one variant step. An hour, so a phrasing gets a fair attempt before it rotates. */
const STUDY_VARIANT_WINDOW_MS = 60 * 60_000

/** FNV-1a. Stable across processes and deploys, which `String.hashCode`-style ad hoc sums are not. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Study variant for a continuous-lane gap. Non-negative and safe to pass straight into the signal
 * builders, which take it modulo the theme count.
 */
export function cosUniversityContinuousStudyVariant(planKey: string, now: Date = new Date()): number {
  const window = Math.floor(now.getTime() / STUDY_VARIANT_WINDOW_MS)
  const seed = stableHash(String(planKey || 'unkeyed'))
  return Math.abs((seed % 997) + window) % Number.MAX_SAFE_INTEGER
}
