//
// WHY A LEARNING GAP KEEPS FAILING — the missing half of the gap lifecycle.
//
// Today markQueuedReasoningGaps() writes `status: 'failed'` and nothing else. The next cycle selects
// ['pending','failed'] again, so the same gap is retried indefinitely with no memory of what went
// wrong last time. A gap that has failed twelve times is treated exactly like one failing its first —
// same slot, same acquisition query, same outcome. That is not learning; it is a loop.
//
// This module reads the failure history and decides what the failure MEANS. Three outcomes, because
// they need three different responses:
//
//   RETRY        — few attempts, or attempts that failed for transient reasons. Keep trying.
//   UNACQUIRABLE — attempted repeatedly, always failing to find source material. The subject is
//                  real but nothing published covers it, or the adapters cannot reach it. Retrying
//                  costs a study slot every cycle and will keep costing it forever.
//   MALFORMED    — the gap itself is not a studyable question. Distinct from unacquirable: no
//                  acquisition strategy could ever help, because there is nothing coherent to study.
//
// WHY THIS IS NOT JUST A RETRY LIMIT: a retry limit would silence a gap. An autopsy records the
// REASON, which is itself capability signal. "COS repeatedly cannot answer questions about X and no
// source material exists" is something a buyer should be told and a curriculum should act on — very
// different from "that gap was noisy". Silencing without recording throws away the finding.
//
// PURE — no imports, no I/O, testable under plain `node --test`.

export type GapAttempt = {
  /** Free-text reason recorded for one failed cycle, if any. */
  reason?: string | null
  at?: string | null
}

export type GapFailureRow = {
  id?: string | null
  subject?: string | null
  question?: string | null
  capability?: string | null
  status?: string | null
  repeatedCount?: number | null
  attemptCount?: number | null
  attempts?: GapAttempt[] | null
  escalationReason?: string | null
}

export type AutopsyVerdict = 'retry' | 'unacquirable' | 'malformed'

export type AutopsyFinding = {
  gapId: string
  verdict: AutopsyVerdict
  /** Written for a person, not a parser — this is the record a curriculum decision rests on. */
  rationale: string
  /** True when the gap should leave the study window. */
  terminal: boolean
  attemptCount: number
  dominantReason: string | null
}

/** Below this, failure is ordinary. A subject can miss twice and still be perfectly studyable. */
export const MINIMUM_ATTEMPTS_BEFORE_TERMINAL = 4

/**
 * Reasons that mean "the pipeline had a bad day", not "this cannot be learned". A gap failing only
 * for these is always retried — declaring a subject unacquirable because an adapter timed out would
 * permanently discard a perfectly good study target.
 */
const TRANSIENT_REASON = /(timeout|timed out|rate limit|429|５0\d|50\d\b|network|econn|fetch failed|unavailable|capacity)/i
/** Reasons that mean acquisition genuinely found nothing. */
const NO_MATERIAL_REASON = /(no (results|sources|documents|candidates|material)|empty result|not found|zero candidates|no acquirable)/i

function clean(value: unknown, max = 300): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Is this a studyable question at all?
 *
 * Deliberately conservative: it only rejects what is clearly not a research subject. The existing
 * normalizeQueuedGapSubject() already drops obvious fragments at selection time, so anything
 * reaching here has passed that filter — this catches the narrower case of a gap that survived
 * selection but still has nothing to study.
 */
export function isStudyableGap(row: GapFailureRow): boolean {
  const subject = clean(row.subject, 200)
  const question = clean(row.question, 500)
  if (!subject || !question) return false
  const subjectWords = subject.split(/\s+/).filter(word => /[a-z]/i.test(word))
  const questionWords = question.split(/\s+/).filter(word => /[a-z]/i.test(word))
  if (subjectWords.length < 2) return false
  if (questionWords.length < 4) return false
  return true
}

function dominantReason(row: GapFailureRow): string | null {
  const reasons = (row.attempts ?? [])
    .map(attempt => clean(attempt?.reason, 200))
    .filter(Boolean)
  if (!reasons.length) return clean(row.escalationReason, 200) || null
  const counts = new Map<string, number>()
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Decide what a gap's failure history means.
 *
 * Never returns terminal on thin evidence. Every terminal verdict carries the attempt count and the
 * dominant reason, so the decision can be audited and reversed rather than taken on trust.
 */
export function autopsyGap(row: GapFailureRow, minimumAttempts = MINIMUM_ATTEMPTS_BEFORE_TERMINAL): AutopsyFinding {
  const gapId = clean(row.id, 80)
  const attemptCount = Math.max(
    Number(row.attemptCount) || 0,
    (row.attempts ?? []).length,
    Number(row.repeatedCount) || 0,
  )
  const reason = dominantReason(row)

  if (!isStudyableGap(row)) {
    return {
      gapId,
      verdict: 'malformed',
      rationale: `The gap is not a studyable question (subject "${clean(row.subject, 60)}", question "${clean(row.question, 80)}"). No acquisition strategy can help, so retrying only consumes a study slot.`,
      terminal: true,
      attemptCount,
      dominantReason: reason,
    }
  }

  if (attemptCount < minimumAttempts) {
    return {
      gapId,
      verdict: 'retry',
      rationale: `Only ${attemptCount} attempt(s); failure is still ordinary. A subject can miss several cycles and remain perfectly studyable.`,
      terminal: false,
      attemptCount,
      dominantReason: reason,
    }
  }

  const reasons = (row.attempts ?? []).map(attempt => clean(attempt?.reason, 200)).filter(Boolean)
  const allTransient = reasons.length > 0 && reasons.every(entry => TRANSIENT_REASON.test(entry))
  if (allTransient) {
    return {
      gapId,
      verdict: 'retry',
      rationale: `${attemptCount} attempts, but every recorded failure was transient (${reason}). The pipeline failed, not the subject — retiring it would discard a studyable target over an adapter problem.`,
      terminal: false,
      attemptCount,
      dominantReason: reason,
    }
  }

  const noMaterial = reasons.some(entry => NO_MATERIAL_REASON.test(entry))
  return {
    gapId,
    verdict: 'unacquirable',
    rationale: noMaterial
      ? `${attemptCount} attempts, repeatedly finding no source material (${reason}). The subject may be real, but nothing reachable covers it — this is a curriculum and source-catalogue finding, not noise.`
      : `${attemptCount} attempts without acquiring usable evidence${reason ? ` (${reason})` : ''}. Retiring it from the study window; the gap remains as capability signal.`,
    terminal: true,
    attemptCount,
    dominantReason: reason,
  }
}

export type AutopsyBatch = {
  considered: number
  retry: AutopsyFinding[]
  terminal: AutopsyFinding[]
  byVerdict: Record<AutopsyVerdict, number>
}

export function autopsyGaps(rows: readonly GapFailureRow[], minimumAttempts = MINIMUM_ATTEMPTS_BEFORE_TERMINAL): AutopsyBatch {
  const findings = (Array.isArray(rows) ? rows : []).map(row => autopsyGap(row, minimumAttempts))
  const byVerdict: Record<AutopsyVerdict, number> = { retry: 0, unacquirable: 0, malformed: 0 }
  for (const finding of findings) byVerdict[finding.verdict] += 1
  return {
    considered: findings.length,
    retry: findings.filter(finding => !finding.terminal),
    terminal: findings.filter(finding => finding.terminal),
    byVerdict,
  }
}
