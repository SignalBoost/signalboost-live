// saas/lib/ai/cos/temporalClaimGuard.ts
//
// STOP COS ASSERTING PRESENT-TENSE FACTS IT CANNOT KNOW.
//
// Observed 2026-08-21. Asked "when did George Foreman die", COS answered:
//
//     "George Foreman is not dead; he is still alive. As of 2024, the former heavyweight boxing
//      champion ... continues to be active in public life, business, and media."
//
// Foreman died on 21 March 2025. Three separate failures in two sentences:
//
//   1. FLAT WRONG on a checkable fact about a real person.
//   2. "As of 2024" — the MODEL'S TRAINING CUTOFF surfacing as if it were the present day. COS has
//      no concept of "now" versus "when my weights were frozen", so it narrates stale knowledge in
//      the present tense.
//   3. NO HEDGE, NO CITATION, HIGH CONFIDENCE. Zero evidence was cited, yet the answer asserted a
//      living person's status without qualification.
//
// THIS IS A CLASS, NOT AN INCIDENT. "Is X still alive", "who is the current CEO", "is Y still
// supported", "what is the latest version" all have the same shape: the true answer changes after
// training, COS has no on-demand lookup, and its corpus is 137 scientific journals. It cannot be
// right about these by construction — so the only honest behaviour is to say so.
//
// For a product sold on provenance, this is the worst failure mode available: not "I don't know",
// but a confident, uncited, checkable falsehood. A buyer asking "is this vendor still supported" or
// "is that CVE still open" gets the same answer shape.
//
// WHAT THIS MODULE DOES NOT DO: it does not try to know the answer. It detects that a question is
// time-sensitive and that the supporting evidence is too old (or absent) to justify a present-tense
// claim, and tells the caller to abstain or hedge. Abstention is correct here; guessing is not.
//
// PURE — no imports, no I/O, testable under plain `node --test`.

export type TemporalKind =
  | 'life_status'
  | 'current_holder'
  | 'ongoing_status'
  | 'latest_version'
  | 'recent_event'

export type TemporalClassification = {
  sensitive: boolean
  kind: TemporalKind | null
  /** Why it was flagged — surfaced in provenance so the decision is never opaque. */
  reason: string
}

/** Mortality, and anything that resolves to "is this person still alive". */
const LIFE_STATUS = /\b(?:still alive|is\s+.{0,60}\b(?:alive|dead|deceased)\b|(?:did|has|have)\s+.{0,60}\b(?:die|died|pass(?:ed)? away)\b|when\s+(?:did\s+)?[^?!.]{0,60}\b(?:die|died|pass(?:ed)? away)\b|(?:date|cause) of death|passed away)\b/i
/** "Who is the current/present X" — role holders change. */
const CURRENT_HOLDER = /\b(who is (the )?(current|present|new)|current (ceo|president|chair|head|owner|manager|champion|leader)|who (currently )?(runs|leads|owns|holds))\b/i
/** "Is X still Y" — support status, employment, operation, marriage, incumbency. */
const ONGOING_STATUS = /\b(still (in business|operating|supported|maintained|available|active|running|employed|married|working|the))\b/i
/** Versions, releases, prices, models. */
const LATEST_VERSION = /\b(latest|newest|most recent|current) (version|release|model|price|pricing|edition)\b/i
/** Explicit recency windows. */
const RECENT_EVENT = /\b(this (year|month|week)|right now|as of (today|now)|these days|nowadays|recently|so far this year)\b/i

/**
 * A year written as an "as of" anchor. Finding one in an ANSWER is the tell that the model narrated
 * its training cutoff as the present — the exact tic in the Foreman reply.
 */
const AS_OF_YEAR = /\bas of (?:early |mid[- ]|late )?(\d{4})\b/i

export function classifyTemporalSensitivity(prompt: string): TemporalClassification {
  const text = String(prompt ?? '')
  const checks: Array<[RegExp, TemporalKind, string]> = [
    [LIFE_STATUS, 'life_status', 'asks whether a person is alive or when they died — a fact that changes after training and is checkable, so a wrong answer is a visible falsehood'],
    [CURRENT_HOLDER, 'current_holder', 'asks who currently holds a role — role holders change after training'],
    [ONGOING_STATUS, 'ongoing_status', 'asks whether something is still the case — status changes after training'],
    [LATEST_VERSION, 'latest_version', 'asks for the latest version, price or release — superseded after training'],
    [RECENT_EVENT, 'recent_event', 'anchored to the present moment, which the model cannot observe'],
  ]
  for (const [pattern, kind, reason] of checks) {
    if (pattern.test(text)) return { sensitive: true, kind, reason }
  }
  return { sensitive: false, kind: null, reason: 'No present-tense or recency anchor detected.' }
}

export type TemporalVerdict = {
  /** True when the answer must not be asserted as written. */
  violation: boolean
  code: 'stale_as_of_anchor' | 'unsupported_present_claim' | 'ok'
  reason: string
  /** What to tell the user instead. Empty when there is no violation. */
  suggestedAbstention: string
}

export type TemporalEvidence = {
  /** ISO date of the freshest supporting evidence, or null when nothing dated was cited. */
  freshestEvidenceAt?: string | null
  /** How many evidence items the answer actually cited. */
  citedCount?: number | null
}

/** Evidence older than this cannot support a present-tense claim about a changeable fact. */
export const EVIDENCE_FRESHNESS_DAYS = 180

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Judge whether an answer to a time-sensitive question is safe to assert.
 *
 * Deliberately strict in one direction only: it never upgrades a hedged answer, and it never claims
 * to know the true answer. The worst outcome it can produce is an unnecessary abstention, which is
 * cheap. The outcome it prevents — a confident uncited falsehood about a real person — is not.
 */
export function assessTemporalAnswer(
  prompt: string,
  answer: string,
  evidence: TemporalEvidence = {},
  now: Date = new Date(),
): TemporalVerdict {
  const classification = classifyTemporalSensitivity(prompt)
  const text = String(answer ?? '')

  // A stale "as of <year>" anchor is a violation regardless of the question, because it presents the
  // training cutoff as the present moment.
  const asOf = AS_OF_YEAR.exec(text)
  if (asOf) {
    const year = Number(asOf[1])
    if (Number.isFinite(year) && year < now.getUTCFullYear()) {
      return {
        violation: true,
        code: 'stale_as_of_anchor',
        reason: `The answer says "as of ${year}" while the current year is ${now.getUTCFullYear()}. That is the model's training cutoff being narrated as the present, not a dated claim from evidence.`,
        suggestedAbstention: `My information about this may end around ${year}, and it is now ${now.getUTCFullYear()}. I cannot confirm the current position without a live source.`,
      }
    }
  }

  if (!classification.sensitive) {
    return { violation: false, code: 'ok', reason: classification.reason, suggestedAbstention: '' }
  }

  const citedCount = Number(evidence.citedCount ?? 0) || 0
  const freshest = evidence.freshestEvidenceAt ? new Date(evidence.freshestEvidenceAt) : null
  const freshEnough = freshest !== null
    && !Number.isNaN(freshest.getTime())
    && daysBetween(freshest, now) <= EVIDENCE_FRESHNESS_DAYS

  if (citedCount > 0 && freshEnough) {
    return { violation: false, code: 'ok', reason: `Supported by ${citedCount} cited item(s), freshest within ${EVIDENCE_FRESHNESS_DAYS} days.`, suggestedAbstention: '' }
  }

  return {
    violation: true,
    code: 'unsupported_present_claim',
    reason: `The question ${classification.reason}, but the answer cites ${citedCount} item(s)${freshest ? ` and the freshest is ${daysBetween(freshest, now)} days old` : ' and no dated evidence'}. A present-tense claim here would rest on training data, not evidence.`,
    suggestedAbstention: abstentionFor(classification.kind),
  }
}

function abstentionFor(kind: TemporalKind | null): string {
  switch (kind) {
    case 'life_status':
      return 'I cannot confirm this from current evidence. Whether someone is living can change after my information was compiled, and I have no dated source here — please check a current source rather than rely on me for this.'
    case 'current_holder':
      return 'I cannot confirm who currently holds this role from dated evidence. Role holders change, and answering from memory alone would risk naming someone who has since left.'
    case 'ongoing_status':
      return 'I cannot confirm the current status from dated evidence. This may have changed since my information was compiled.'
    case 'latest_version':
      return 'I cannot confirm the latest version or price from dated evidence — these are superseded frequently, and I have no current source.'
    default:
      return 'I cannot confirm the present state of this from dated evidence, so I will not assert it.'
  }
}
