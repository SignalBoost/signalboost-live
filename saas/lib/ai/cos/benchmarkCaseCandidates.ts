// saas/lib/ai/cos/benchmarkCaseCandidates.ts
//
// WHICH OBSERVED FAILURES ARE WORTH TURNING INTO HELD-OUT BENCHMARK CASES — and which must not be.
//
// The benchmark suite is small (6 active cases) and the obvious way to grow it is to pipe failed
// production queries straight in. That would break it, for a reason worth stating plainly:
//
//   COS ALREADY STUDIES ITS OWN FAILURES. A low-confidence or escalated turn becomes a row in
//   cos_learning_gaps and then a study subject for the daily cycle. If the same interaction also
//   becomes a benchmark case, the benchmark is measuring recall of material COS was handed. The
//   pass rate climbs; capability does not. That is the single failure mode a held-out suite exists
//   to prevent.
//
// So this module does three things and refuses to do a fourth:
//   1. Decides whether an observed failure is a real, repeatable failure rather than noise.
//   2. Sanitizes the prompt, because real user text carries addresses, keys and names that must not
//      land in a durable table.
//   3. Flags CONTAMINATION — material COS has already studied — so it can never become held-out.
//   4. It does NOT invent pass criteria. Nothing here decides what a correct answer must contain;
//      the scoring rubric is required-term matching, and required terms authored by the same system
//      being tested are not a test. A person supplies them at approval.
//
// PURE AND MODEL-FREE.

import { createHash } from 'node:crypto'

/** A row from cos_learning_gaps — the durable record of turns COS could not answer confidently. */
export type ObservedFailureRow = {
  id?: string | null
  subject?: string | null
  question?: string | null
  capability?: string | null
  confidence?: number | null
  escalation_reason?: string | null
  status?: string | null
  repeated_count?: number | null
  created_at?: string | null
}

export type CandidateAssessment = {
  eligible: boolean
  reason: string
  sourceRef: string
  track: string
  /** Sanitized prompt. Empty when not eligible. */
  prompt: string
  sourceHash: string
  observedConfidence: number | null
  escalationReason: string | null
  repeatedCount: number
  contaminated: boolean
  contaminationReason: string | null
  /** What was removed during sanitization, for the reviewer to see. Never the removed values. */
  redactions: string[]
}

/** Below this, the turn genuinely went badly. Above it, COS answered and was merely not certain. */
export const FAILURE_CONFIDENCE_CEILING = 0.6
/** A prompt shorter than this is a fragment, not a scenario. */
export const MINIMUM_PROMPT_CHARACTERS = 40
export const MINIMUM_PROMPT_WORDS = 6
export const MAXIMUM_PROMPT_CHARACTERS = 2000

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const URL = /https?:\/\/\S+/g
// Long digit runs cover phone numbers, account numbers and card-like values without trying to
// classify which is which — a redaction that guesses wrong is worse than one that is broad.
const LONG_DIGITS = /\b\d[\d\s().-]{7,}\d\b/g
// Anything key-shaped: long unbroken alphanumeric runs, and the known secret prefixes.
const SECRET_PREFIXED = /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[abprs]|AKIA|ASIA)[-_A-Za-z0-9]{8,}\b/g
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g

function clean(value: unknown, max = MAXIMUM_PROMPT_CHARACTERS): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Redact anything that must not be retained. Order matters: secret-prefixed values are matched
 * before the generic long-token rule so the reviewer sees the specific label.
 */
export function sanitizePrompt(raw: string): { prompt: string; redactions: string[] } {
  const redactions: string[] = []
  let text = clean(raw)

  const apply = (pattern: RegExp, label: string, placeholder: string) => {
    if (!pattern.test(text)) return
    pattern.lastIndex = 0
    text = text.replace(pattern, placeholder)
    redactions.push(label)
  }

  apply(EMAIL, 'email_address', '[redacted-email]')
  apply(URL, 'url', '[redacted-url]')
  apply(SECRET_PREFIXED, 'credential', '[redacted-credential]')
  apply(LONG_DIGITS, 'long_number', '[redacted-number]')
  apply(LONG_TOKEN, 'opaque_token', '[redacted-token]')

  return { prompt: text.replace(/\s+/g, ' ').trim(), redactions }
}

/**
 * Has COS already been taught this? A resolved gap means the daily cycle accepted evidence for that
 * subject, so an answer may now be recall rather than reasoning.
 *
 * `studiedSubjects` is supplied by the caller from the retained corpus. This module never queries.
 */
function assessContamination(row: ObservedFailureRow, studiedSubjects: Set<string>): { contaminated: boolean; reason: string | null } {
  const status = clean(row.status, 40).toLowerCase()
  if (status === 'resolved') {
    return { contaminated: true, reason: 'The gap is resolved, so the learning cycle already accepted evidence for it. A correct answer could be recall of studied material.' }
  }
  const subject = clean(row.subject, 200).toLowerCase()
  if (subject && studiedSubjects.has(subject)) {
    return { contaminated: true, reason: `The retained corpus already contains evidence for "${subject}".` }
  }
  return { contaminated: false, reason: null }
}

function looksLikeAScenario(prompt: string): boolean {
  if (prompt.length < MINIMUM_PROMPT_CHARACTERS) return false
  const words = prompt.split(/\s+/).filter(word => /[a-z]/i.test(word))
  if (words.length < MINIMUM_PROMPT_WORDS) return false
  // A prompt that is mostly redaction placeholders carried no reusable scenario.
  const placeholderShare = (prompt.match(/\[redacted-[a-z]+\]/g) ?? []).length / Math.max(1, words.length)
  return placeholderShare < 0.3
}

/**
 * Decide whether one observed failure should enter the review queue.
 *
 * Eligibility is deliberately strict. A benchmark suite grown from every bad turn fills with typos
 * and one-off phrasing, and then a falling pass rate says nothing about capability.
 */
export function assessFailureAsCandidate(
  row: ObservedFailureRow,
  args: { studiedSubjects?: Iterable<string> } = {},
): CandidateAssessment {
  const studied = new Set<string>()
  for (const subject of args.studiedSubjects ?? []) {
    const normalized = clean(subject, 200).toLowerCase()
    if (normalized) studied.add(normalized)
  }

  const { prompt, redactions } = sanitizePrompt(clean(row.question))
  const sourceRef = clean(row.id, 80)
  const track = clean(row.capability, 80) || 'general_reasoning'
  const confidenceRaw = Number(row.confidence)
  const observedConfidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null
  const escalationReason = clean(row.escalation_reason, 300) || null
  const repeatedCountRaw = Number(row.repeated_count)
  const repeatedCount = Number.isFinite(repeatedCountRaw) && repeatedCountRaw >= 1 ? Math.floor(repeatedCountRaw) : 1
  const contamination = assessContamination(row, studied)

  const base = {
    sourceRef,
    track,
    sourceHash: prompt ? sha256(prompt.toLowerCase()) : '',
    observedConfidence,
    escalationReason,
    repeatedCount,
    contaminated: contamination.contaminated,
    contaminationReason: contamination.reason,
    redactions,
  }

  if (!prompt) {
    return { ...base, eligible: false, reason: 'The gap carries no question text.', prompt: '' }
  }
  if (!looksLikeAScenario(prompt)) {
    return { ...base, eligible: false, reason: 'Too short or fragmentary to be a reusable scenario. Production has already shown that loose fragments become durable subjects if nothing rejects them.', prompt: '' }
  }

  const hardEnough =
    (observedConfidence !== null && observedConfidence < FAILURE_CONFIDENCE_CEILING) ||
    Boolean(escalationReason) ||
    repeatedCount >= 2

  if (!hardEnough) {
    return { ...base, eligible: false, reason: `Not a demonstrated failure: confidence ${observedConfidence ?? 'unknown'}, no escalation, seen once. A benchmark of easy cases measures nothing.`, prompt: '' }
  }

  return {
    ...base,
    eligible: true,
    reason: contamination.contaminated
      ? 'Eligible for review, but flagged contaminated: usable as practice, never as a held-out case.'
      : 'A repeated or escalated failure with a reusable scenario.',
    prompt,
  }
}

export type CandidateHarvest = {
  considered: number
  eligible: CandidateAssessment[]
  skipped: Array<{ sourceRef: string; reason: string }>
  contaminated: number
}

/** Assess a batch, dropping duplicates by prompt hash within the batch. */
export function harvestCandidates(
  rows: ObservedFailureRow[],
  args: { studiedSubjects?: Iterable<string>; limit?: number } = {},
): CandidateHarvest {
  const limit = Math.max(1, Math.min(200, args.limit ?? 50))
  const seen = new Set<string>()
  const eligible: CandidateAssessment[] = []
  const skipped: Array<{ sourceRef: string; reason: string }> = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const assessment = assessFailureAsCandidate(row, { studiedSubjects: args.studiedSubjects })
    if (!assessment.eligible) {
      skipped.push({ sourceRef: assessment.sourceRef, reason: assessment.reason })
      continue
    }
    if (seen.has(assessment.sourceHash)) {
      skipped.push({ sourceRef: assessment.sourceRef, reason: 'Duplicate of another candidate in this batch.' })
      continue
    }
    seen.add(assessment.sourceHash)
    eligible.push(assessment)
    if (eligible.length >= limit) break
  }

  return {
    considered: Array.isArray(rows) ? rows.length : 0,
    eligible,
    skipped,
    contaminated: eligible.filter(candidate => candidate.contaminated).length,
  }
}

export type PromotionRequest = {
  candidateId?: unknown
  requiredTerms?: unknown
  forbiddenTerms?: unknown
  approvedBy?: unknown
  track?: unknown
}

export type PromotionDecision =
  | { ok: true; requiredTerms: string[]; forbiddenTerms: string[]; approvedBy: string; track: string | null }
  | { ok: false; error: string }

/**
 * Validate a human promotion. Everything this refuses is something that would quietly hollow out the
 * benchmark: an unnamed approver, a contaminated case, or a case with no pass criteria at all.
 */
export function validatePromotion(
  candidate: { contaminated?: boolean; status?: string | null },
  request: PromotionRequest,
): PromotionDecision {
  if (clean(candidate?.status, 40) !== 'pending') {
    return { ok: false, error: 'Only a pending candidate can be promoted.' }
  }
  if (candidate?.contaminated) {
    return { ok: false, error: 'This candidate is contaminated — COS has already studied the material, so a pass would not distinguish reasoning from recall. Author an independent variant instead of promoting this one.' }
  }

  const approvedBy = clean(request.approvedBy, 200)
  if (!approvedBy) return { ok: false, error: 'An approver must be recorded. A benchmark case without a named approver is an assertion.' }

  const requiredTerms = (Array.isArray(request.requiredTerms) ? request.requiredTerms : [])
    .map(term => clean(term, 80).toLowerCase())
    .filter(Boolean)
  if (requiredTerms.length < 2) {
    return { ok: false, error: 'At least two required terms must be supplied by the reviewer. Pass criteria generated from the answer COS gave would make the case unfailable.' }
  }

  const forbiddenTerms = (Array.isArray(request.forbiddenTerms) ? request.forbiddenTerms : [])
    .map(term => clean(term, 80).toLowerCase())
    .filter(Boolean)

  const overlap = requiredTerms.filter(term => forbiddenTerms.includes(term))
  if (overlap.length > 0) {
    return { ok: false, error: `A term cannot be both required and forbidden: ${overlap.join(', ')}. This case could never pass.` }
  }

  return { ok: true, requiredTerms, forbiddenTerms, approvedBy, track: clean(request.track, 80) || null }
}
