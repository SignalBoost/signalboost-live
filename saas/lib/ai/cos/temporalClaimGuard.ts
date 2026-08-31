// saas/lib/ai/cos/temporalClaimGuard.ts
//
// CLASSIFY FACTS THAT CAN BECOME STALE AFTER MODEL TRAINING.
//
// This module is deliberately about a failure CLASS, not a celebrity/person incident. Any public
// fact whose truth can change after the model weights or durable memory were written must be treated
// as temporal. The classifier is pure and dependency-free so both routing and answer-audit code can
// share one definition of "this may have changed".
import { englishNormalizedForClassification } from './crossLanguageFreshness.ts'

export type TemporalKind =
  | 'life_status'
  | 'current_holder'
  | 'ongoing_status'
  | 'latest_state'
  | 'current_rule'
  | 'current_security'
  | 'recent_event'

export type TemporalClassification = {
  sensitive: boolean
  kind: TemporalKind | null
  /** Why it was flagged — surfaced in provenance so the decision is never opaque. */
  reason: string
}

const LIFE_STATUS = /\b(?:still\s+alive|(?:is|was)\s+[^?.!]{1,80}\bdead\b|(?:has|have|did)\s+[^?.!]{1,80}\b(?:die|died|pass(?:ed)?\s+away)\b|when\s+(?:did\s+)?[^?.!]{1,80}\b(?:die|died|pass(?:ed)?\s+away)\b|cause\s+of\s+death|date\s+of\s+death|passed\s+away|deceased)\b/i
const CURRENT_HOLDER = /\b(?:who\s+(?:is|are|['’]s)\s+(?:(?:the\s+)?(?:current|present|new)\s+)?(?:president|prime\s+minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|ceo|cfo|cio|cto|chair(?:man|woman)?|head|owner|manager|champion|leader)|current\s+(?:ceo|president|chair|head|owner|manager|champion|leader)|who\s+(?:currently\s+)?(?:runs|leads|owns|holds))\b/i
const ONGOING_STATUS = /\b(?:still\s+(?:in\s+business|operating|supported|maintained|available|active|running|open|closed|legal|banned|employed|married|working|the)|(?:is|are|does|do|has|have)\s+[^?.!]{1,100}\bstill\b)\b/i
const MUTABLE_STATE_NOUN = '(?:version|release|model|price|pricing|edition|status|availability|schedule|ranking|rate|guidance|policy|plan|specification|specifications)'
const ENTITY_TOKEN = "[\\p{L}\\p{N}._+/#()'’:-]+"
const LATEST_STATE = new RegExp(`\\b(?:latest|newest|most\\s+recent|current)\\s+(?:(?:${ENTITY_TOKEN})\\s+){0,6}${MUTABLE_STATE_NOUN}\\b`, 'iu')
const CURRENT_RULE = /\b(?:(?:current|latest|new|updated)\s+(?:law|laws|regulation|regulations|rule|rules|requirement|requirements|visa\s+rule|visa\s+requirements?|entry\s+rule|entry\s+requirements?|passport\s+requirements?|tax\s+rate|policy|guidance)|(?:law|laws|regulation|regulations|rule|rules|requirements?|visa\s+requirements?|entry\s+requirements?|passport\s+requirements?)\s+(?:now|today|currently))\b/i
const CURRENT_SECURITY = /\b(?:(?:current|latest|new|recent|active|open|patched|unpatched|exploited)\s+(?:cve|vulnerability|vulnerabilities|security\s+advisory|security\s+issue|exploit)|CVE-\d{4}-\d+[^?.!]{0,50}\b(?:still\s+)?(?:open|patched|unpatched|exploited|active))\b/i
const RECENT_EVENT = /\b(?:today|today's|tonight|right\s+now|as\s+of\s+(?:today|now)|this\s+(?:week|month|year)|recently|newly|just\s+announced|breaking|latest\s+news|recent\s+news|live\s+updates?)\b/i

/** A stale "as of <year>" answer often exposes the model cutoff as if it were the present. */
const AS_OF_YEAR = /\bas of (?:early |mid[- ]|late )?(\d{4})\b/i

export function classifyTemporalSensitivity(prompt: string): TemporalClassification {
  prompt = englishNormalizedForClassification(prompt)
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { sensitive: false, kind: null, reason: 'No prompt text was supplied.' }

  // Specific temporal domains must win before the generic "still" classifier. Otherwise a security
  // question such as "is CVE-... still unpatched?" is technically fresh but loses its security class.
  const checks: Array<[RegExp, TemporalKind, string]> = [
    [LIFE_STATUS, 'life_status', 'asks about a person’s life/death status, which can change after training and must be freshly verified'],
    [CURRENT_HOLDER, 'current_holder', 'asks who currently holds a role or position, which can change after training'],
    [CURRENT_RULE, 'current_rule', 'asks about a current law, regulation, rule, policy, or requirement'],
    [CURRENT_SECURITY, 'current_security', 'asks about the current state of a vulnerability, advisory, CVE, or exploit'],
    [LATEST_STATE, 'latest_state', 'asks for the latest/current version, release, price, status, availability, or similar mutable value'],
    [ONGOING_STATUS, 'ongoing_status', 'asks whether a state is still true, which can change after training'],
    [RECENT_EVENT, 'recent_event', 'anchors the answer to the present or a recent time window'],
  ]

  for (const [pattern, kind, reason] of checks) {
    if (pattern.test(text)) return { sensitive: true, kind, reason }
  }
  return { sensitive: false, kind: null, reason: 'No mutable present-state or recency signal detected.' }
}

export type TemporalVerdict = {
  violation: boolean
  code: 'stale_as_of_anchor' | 'unsupported_present_claim' | 'ok'
  reason: string
  suggestedAbstention: string
}

export type TemporalEvidence = {
  freshestEvidenceAt?: string | null
  citedCount?: number | null
  independentSourceCount?: number | null
}

/** Conservative default for truly present-state claims when a dated source is available. */
export const EVIDENCE_FRESHNESS_DAYS = 180

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Final-claim safety audit. Routing should normally have forced temporal questions through live
 * retrieval already; this guard is a second line of defence against an unsupported present-tense
 * assertion or a model-cutoff year leaking into the answer.
 */
export function assessTemporalAnswer(
  prompt: string,
  answer: string,
  evidence: TemporalEvidence = {},
  now: Date = new Date(),
): TemporalVerdict {
  const classification = classifyTemporalSensitivity(prompt)
  const text = String(answer ?? '')

  const asOf = AS_OF_YEAR.exec(text)
  if (asOf) {
    const year = Number(asOf[1])
    if (Number.isFinite(year) && year < now.getUTCFullYear()) {
      return {
        violation: true,
        code: 'stale_as_of_anchor',
        reason: `The answer says "as of ${year}" while the current year is ${now.getUTCFullYear()}. Without explicitly dated evidence, that can be stale model knowledge narrated as the present.`,
        suggestedAbstention: `The answer appears anchored to ${year}, while the current year is ${now.getUTCFullYear()}. I need fresh evidence before asserting the present state.`,
      }
    }
  }

  if (!classification.sensitive) {
    return { violation: false, code: 'ok', reason: classification.reason, suggestedAbstention: '' }
  }

  const citedCount = Math.max(0, Number(evidence.citedCount ?? 0) || 0)
  const independentSourceCount = Math.max(0, Number(evidence.independentSourceCount ?? 0) || 0)
  const freshest = evidence.freshestEvidenceAt ? new Date(evidence.freshestEvidenceAt) : null
  const freshEnough = freshest !== null
    && !Number.isNaN(freshest.getTime())
    && daysBetween(freshest, now) <= EVIDENCE_FRESHNESS_DAYS

  // Death is irreversible once independently established. A death report does not become false just
  // because the confirming articles are older than 180 days; what matters is that the question was
  // checked live now and the material fact is independently corroborated.
  if (classification.kind === 'life_status' && citedCount >= 2 && independentSourceCount >= 2) {
    return { violation: false, code: 'ok', reason: 'Life-status claim is supported by at least two independent cited sources.', suggestedAbstention: '' }
  }

  if (citedCount >= 1 && independentSourceCount >= 1 && freshEnough) {
    return { violation: false, code: 'ok', reason: `Supported by dated evidence within ${EVIDENCE_FRESHNESS_DAYS} days.`, suggestedAbstention: '' }
  }

  return {
    violation: true,
    code: 'unsupported_present_claim',
    reason: `The question ${classification.reason}, but the answer does not have sufficient fresh, independently grounded evidence for a present-state assertion.`,
    suggestedAbstention: abstentionFor(classification.kind),
  }
}

function abstentionFor(kind: TemporalKind | null): string {
  switch (kind) {
    case 'life_status':
      return 'I cannot confirm this life/death fact from enough independent live evidence, so I will not guess.'
    case 'current_holder':
      return 'I cannot confirm who currently holds this role from sufficient fresh evidence, so I will not answer from memory.'
    case 'ongoing_status':
      return 'I cannot confirm whether this is still true from sufficient fresh evidence.'
    case 'latest_state':
      return 'I cannot confirm the latest/current state from sufficient fresh evidence.'
    case 'current_rule':
      return 'I cannot confirm the current rule, law, regulation, or requirement from sufficient fresh evidence.'
    case 'current_security':
      return 'I cannot confirm the current security/vulnerability status from sufficient fresh evidence.'
    default:
      return 'I cannot confirm the present state from sufficient fresh evidence, so I will not assert it.'
  }
}
