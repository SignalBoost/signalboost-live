// Generic freshness policy. It classifies the SHAPE of the question rather than maintaining
// a catalog of presidents, CEOs, prices, laws, versions, etc. Query-time orchestration can use
// maxMemoryAgeMs to decide whether recent sourced memory is fresh enough before going live.

export type CosFreshnessPolicy = {
  required: boolean
  maxMemoryAgeMs: number | null
  reason: string
  forceLiveVerification: boolean
}

const EXPLICIT_CURRENT = /\b(?:current|currently|today|tonight|now|latest|right now|at present|as of(?: today| now| this moment)?)\b/i
const EXPLICIT_VERIFY = /\b(?:verify|confirm|fact[- ]?check|check (?:a )?source|show (?:me )?(?:the )?source|cite (?:a )?source|official source|authoritative source)\b/i
const PRESENT_IDENTITY = /^\s*who\s+is\b/i
const PRESENT_LEADERSHIP = /^\s*who\s+(?:leads|heads|runs)\b/i
const HISTORICAL = /\b(?:who was|who were|former|previous|formerly|historical|history of|in (?:18|19|20)\d{2}|during (?:18|19|20)\d{2})\b/i
const DIAGNOSTIC_OR_DESIGN = /\b(?:diagnose|troubleshoot|debug|root cause|rank (?:the )?(?:causes|hypotheses)|architect|design (?:an?|the)|how would you distinguish|without making production changes)\b/i
const TRANSFORMATIVE = /\b(?:rewrite|edit|proofread|translate|summarize|paraphrase|brainstorm|draft|compose)\b/i

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * How an informed human treats freshness:
 * - explicit current/now/latest wording: memory must be very recent;
 * - explicit verification/source request: go live instead of trusting remembered state;
 * - present-tense identity/leadership questions: recent sourced memory is acceptable for a day;
 * - historical, diagnostic, design, and transformative work is not forced into live lookup.
 */
export function freshnessPolicyForQuestion(input: string): CosFreshnessPolicy {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return { required: false, maxMemoryAgeMs: null, reason: 'empty_input', forceLiveVerification: false }

  if (HISTORICAL.test(text)) {
    return { required: false, maxMemoryAgeMs: null, reason: 'historical_question', forceLiveVerification: false }
  }
  if (DIAGNOSTIC_OR_DESIGN.test(text)) {
    return { required: false, maxMemoryAgeMs: null, reason: 'analytical_reasoning', forceLiveVerification: false }
  }
  if (TRANSFORMATIVE.test(text)) {
    return { required: false, maxMemoryAgeMs: null, reason: 'transformative_task', forceLiveVerification: false }
  }
  if (EXPLICIT_VERIFY.test(text)) {
    return { required: true, maxMemoryAgeMs: 0, reason: 'explicit_live_verification', forceLiveVerification: true }
  }
  if (EXPLICIT_CURRENT.test(text)) {
    return { required: true, maxMemoryAgeMs: HOUR, reason: 'explicit_current_state', forceLiveVerification: false }
  }
  if (PRESENT_IDENTITY.test(text) || PRESENT_LEADERSHIP.test(text)) {
    return { required: true, maxMemoryAgeMs: 24 * HOUR, reason: 'present_tense_identity', forceLiveVerification: false }
  }

  return { required: false, maxMemoryAgeMs: null, reason: 'ordinary_memory_reasoning', forceLiveVerification: false }
}

/** Backward-compatible boolean used by existing orchestration. */
export function requiresFreshExternalEvidence(input: string): boolean {
  return freshnessPolicyForQuestion(input).required
}
