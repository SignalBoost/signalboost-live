// Answer-side freshness and scenario-premise self-reflection.
//
// A prompt can be timeless/normative while the draft answer quietly introduces mutable present-day
// claims ("current industry standards", "most regulators", "the prevailing approach") or turns
// plausible scenario assumptions into asserted facts. Prompt-only routing cannot catch either class.
// This module is deliberately pure: it detects those answer-side claims and provides a conservative
// deterministic fallback that removes them if a local repair pass cannot produce a clean answer.

const EXPLICIT_CURRENT_MARKER = /\b(?:current(?:ly)?|latest|today|right\s+now|present[- ]day|modern[- ]day|recent(?:ly)?|as\s+of\s+20\d{2})\b/i
const MUTABLE_INSTITUTIONAL_TOPIC = /\b(?:industry\s+standards?|legal\s+frameworks?|regulatory\s+frameworks?|regulatory\s+bodies|regulators?|engineering\s+priorities|industry\s+practice|standard\s+practice|prevailing\s+approach|prevailing\s+practice|manufacturers?|companies|agencies|jurisdictions|courts|governments?)\b/i
const MUTABLE_GENERALIZATION = /\b(?:most|many|major|leading|industry|regulatory)\s+(?:manufacturers?|companies|regulators?|regulatory\s+bodies|agencies|jurisdictions|courts|governments?)\b/i
const PRACTICE_ASSERTION = /\b(?:generally|typically|usually|commonly|widely|mostly)\s+(?:prioriti[sz]e|require|follow|use|adopt|prohibit|allow|prefer|treat|consider)\b/i
const PREVAILING_ASSERTION = /\b(?:prevailing|dominant|standard|industry[- ]wide)\s+(?:approach|practice|view|policy|rule|standard)\b/i

// Explicit uncertainty about legal applicability is not itself a mutable current-world claim.
// Example: "I cannot confirm a notification deadline without the affected jurisdictions." That is
// an epistemic boundary, not an assertion that a particular law currently applies.
const CONDITIONAL_OR_UNCERTAIN_LEGAL_CAVEAT = /\b(?:cannot|can't|could\s+not|unable\s+to)\s+(?:confirm|determine|establish|verify)\b|\b(?:depends?\s+on|depending\s+on)\b|\b(?:if|where)\s+(?:legally\s+)?(?:required|applicable)\b|\b(?:legal|privacy|compliance)(?:\/(?:privacy|compliance))*\s+(?:assessment|review|determination|decision)\b|\b(?:determine|assess|confirm)\s+(?:the\s+)?(?:applicable|governing)\s+(?:law|regulation|obligations?|requirements?|jurisdiction)\b/i
const LEGAL_APPLICABILITY_DECISION_GATE = /\b(?:have\s+)?(?:legal|privacy|compliance)(?:\/(?:privacy|compliance))*\s+(?:(?:must|should|will)\s+)?(?:determine|assess|confirm|review)\s+(?:(?:whether|if)\b|(?:the\s+)?(?:applicable|governing)\b|(?:notification|disclosure)\s+(?:obligations?|requirements?)\b)/i
const DIRECT_LEGAL_MANDATE = /\b(?:gdpr|ccpa|cpra|law|regulation|regulations|statute|jurisdiction)\b[^.!?]{0,90}\b(?:requires?|mandates?|prohibits?|imposes?|sets?)\b|\b(?:requires?|mandates?)\b[^.!?]{0,90}\b(?:customer\s+notification|notification\s+deadline|within\s+\d+\s+hours?)\b/i
const NAMED_REGIME_APPLICABILITY_ASSERTION = /\b(?:gdpr|ccpa|cpra|pci(?:[- ]?dss)?)\b[^.!?]{0,150}\b(?:trigger|require|mandate|impose|create|apply)\w*[^.!?]{0,80}\b(?:notification|disclosure|obligation|requirement|penalt|liabilit)\w*|\b(?:under|pursuant\s+to|subject\s+to|frameworks?\s+such\s+as)\b[^.!?]{0,80}\b(?:gdpr|ccpa|cpra|pci(?:[- ]?dss)?)\b[^.!?]{0,150}\b(?:notification|disclosure|obligation|requirement|penalt|liabilit)\w*/i
const UNVERIFIED_LEGAL_CONSEQUENCE = /\b(?:legal\s+liabilit(?:y|ies)|regulatory\s+(?:penalt(?:y|ies)|fines?)|mandatory\s+(?:customer\s+)?(?:notification|disclosure)|(?:notification|disclosure)\s+obligations?)\b/i
const UNSUPPLIED_SENSITIVE_DATA_INFERENCE = /\b(?:billing|customer|account)\s+records?\b[^.!?]{0,120}\b(?:likely|probably|presumably)\b[^.!?]{0,100}\b(?:pii|personally\s+identifiable|personal\s+data|financial\s+data|payment\s+data)\b/i

// Scenario advice can sound persuasive while silently promoting assumptions to facts. These are
// high-value failure signatures from real COS answers: invented competitor loss, insolvency,
// product-market-fit deadlines, completed discovery, market shifts, and unqualified derived
// projections. Explicitly conditional/modelled statements remain allowed.
const EXPLICIT_PROJECTION_ASSUMPTION = /\b(?:if|assuming|assume|under\s+the\s+assumption|holding\b[^.!?]{0,40}\bconstant|with\s+no\b|without\s+(?:offsetting|new|additional)|illustrative|for\s+illustration|not\s+a\s+forecast|scenario\s+only)\b/i
const EXPLICIT_CAUSAL_UNCERTAINTY = /\b(?:could|may|might|depends?\s+on|subject\s+to|would\s+need\s+to\s+model|requires?\s+(?:a\s+)?(?:revenue|burn|unit[- ]economics?)\s+model)\b/i
const UNSUPPLIED_SEVERE_OUTCOME_ASSERTION = /\bmathematically\s+incompatible\b[^.!?]{0,120}\b(?:survival|runway)\b|\b(?:likely|will|would)\s+(?:lead|leading|result)\s+(?:to|in)\s+(?:insolvency|bankruptcy|collapse)\b|\bexistential\s+threat\b/i
const UNSUPPLIED_COMPETITOR_ASSERTION = /\b(?:bleed(?:ing)?|los(?:e|ing)|driv(?:e|ing))\s+(?:users?|customers?|accounts?)\s+to\s+competitors?\b/i
const UNSUPPLIED_STRATEGIC_DEADLINE = /\b(?:we|you|the\s+company)\s+(?:have|has)\s+\d+\s+months?\s+to\s+(?:prove|reach|achieve|find)\s+(?:product[- ]market\s+fit|pmf)\b|\b\d+\s+months?\s+to\s+(?:prove|reach|achieve|find)\s+(?:product[- ]market\s+fit|pmf)\b/i
const UNSUPPLIED_MARKET_SHIFT = /\b(?:market\s+conditions?|the\s+market)\s+(?:has|have)\s+(?:shifted|changed)\b/i
const UNSUPPLIED_PROJECT_STATUS = /\b(?:we(?:'ve|\s+have)|you(?:'ve|\s+have)|the\s+(?:team|company|project)\s+has)\b[^.!?]{0,100}\b(?:extracted|captured|learned|completed|finished)\b[^.!?]{0,120}\b(?:insights?|discovery|phase|prototype|work)\b|\b(?:discovery|exploratory|prototype)\s+phase\s+(?:is|has\s+been)\s+(?:done|complete|completed|finished)\b/i
const UNSUPPLIED_CAUSAL_FINANCIAL_OUTCOME = /\b(?:retains?|preserves?)\s+(?:significantly\s+)?more\s+revenue\b|\bextends?\s+(?:the\s+)?(?:effective\s+)?runway\b/i
const UNQUALIFIED_TIME_PROJECTION = /\b(?:in|over)\s+\d+\s+months?\b[^.!?]{0,180}\b(?:reduces?|shrinks?|cuts?|loses?|declines?)\b[^.!?]{0,140}\b\d+(?:\.\d+)?%\b|\b(?:company|user\s+base|customer\s+base|cohort)\b[^.!?]{0,100}\b(?:loses?|declines?|shrinks?)\b[^.!?]{0,70}\b~?\d+(?:\.\d+)?%\b[^.!?]{0,100}\b(?:over|in)\s+\d+\s+months?\b/i

export type AnswerFreshnessSignal = {
  code: 'explicit_current_marker' | 'mutable_institutional_claim' | 'mutable_generalization' | 'practice_assertion' | 'prevailing_assertion' | 'unsupported_scenario_inference'
  excerpt: string
}

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string): string {
  return compact(text).slice(0, 220)
}

function sentencesOf(answer: string): string[] {
  const text = String(answer || '').trim()
  if (!text) return []
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(sentence => compact(sentence))
    .filter(Boolean)
}

function isPureLegalUncertainty(sentence: string): boolean {
  // A narrow decision-gate construction is non-assertive even if its subordinate clause contains
  // words such as "law requires". Example: "Legal must determine whether applicable law requires
  // customer notification." The sentence does not assert that the law applies; it assigns review.
  if (LEGAL_APPLICABILITY_DECISION_GATE.test(sentence) && !EXPLICIT_CURRENT_MARKER.test(sentence)) return true
  return CONDITIONAL_OR_UNCERTAIN_LEGAL_CAVEAT.test(sentence)
    && !EXPLICIT_CURRENT_MARKER.test(sentence)
    && !DIRECT_LEGAL_MANDATE.test(sentence)
    && !NAMED_REGIME_APPLICABILITY_ASSERTION.test(sentence)
}

function isUnsupportedScenarioInference(sentence: string): boolean {
  if (
    UNSUPPLIED_SEVERE_OUTCOME_ASSERTION.test(sentence)
    || UNSUPPLIED_COMPETITOR_ASSERTION.test(sentence)
    || UNSUPPLIED_STRATEGIC_DEADLINE.test(sentence)
    || UNSUPPLIED_MARKET_SHIFT.test(sentence)
    || UNSUPPLIED_PROJECT_STATUS.test(sentence)
  ) return true

  if (UNSUPPLIED_CAUSAL_FINANCIAL_OUTCOME.test(sentence) && !EXPLICIT_CAUSAL_UNCERTAINTY.test(sentence)) return true
  return UNQUALIFIED_TIME_PROJECTION.test(sentence) && !EXPLICIT_PROJECTION_ASSUMPTION.test(sentence)
}

function signalsForSentence(sentence: string): AnswerFreshnessSignal[] {
  if (!sentence || isPureLegalUncertainty(sentence)) return []

  const out: AnswerFreshnessSignal[] = []
  if (DIRECT_LEGAL_MANDATE.test(sentence) || NAMED_REGIME_APPLICABILITY_ASSERTION.test(sentence)) {
    out.push({ code: 'mutable_institutional_claim', excerpt: excerpt(sentence) })
  }
  if (UNVERIFIED_LEGAL_CONSEQUENCE.test(sentence) && !CONDITIONAL_OR_UNCERTAIN_LEGAL_CAVEAT.test(sentence)) {
    out.push({ code: 'mutable_institutional_claim', excerpt: excerpt(sentence) })
  }
  if (UNSUPPLIED_SENSITIVE_DATA_INFERENCE.test(sentence) || isUnsupportedScenarioInference(sentence)) {
    out.push({ code: 'unsupported_scenario_inference', excerpt: excerpt(sentence) })
  }
  if (EXPLICIT_CURRENT_MARKER.test(sentence) && MUTABLE_INSTITUTIONAL_TOPIC.test(sentence)) {
    out.push({ code: 'explicit_current_marker', excerpt: excerpt(sentence) })
  }
  if (MUTABLE_INSTITUTIONAL_TOPIC.test(sentence) && /\b(?:prioriti[sz]e|require|follow|use|adopt|prohibit|allow|prefer|govern|regulat|approach|practice)\w*\b/i.test(sentence)) {
    out.push({ code: 'mutable_institutional_claim', excerpt: excerpt(sentence) })
  }
  if (MUTABLE_GENERALIZATION.test(sentence)) out.push({ code: 'mutable_generalization', excerpt: excerpt(sentence) })
  if (PRACTICE_ASSERTION.test(sentence)) out.push({ code: 'practice_assertion', excerpt: excerpt(sentence) })
  if (PREVAILING_ASSERTION.test(sentence)) out.push({ code: 'prevailing_assertion', excerpt: excerpt(sentence) })
  return out
}

export function answerFreshnessSignals(answer: string): AnswerFreshnessSignal[] {
  return sentencesOf(answer).flatMap(signalsForSentence)
}

export function answerNeedsFreshnessReflection(answer: string): boolean {
  return answerFreshnessSignals(answer).length > 0
}

function sentenceNeedsRemoval(sentence: string): boolean {
  return answerNeedsFreshnessReflection(sentence)
}

/**
 * Last-resort safety fallback. Local self-reflection should normally rewrite the answer coherently.
 * If it cannot, remove only sentences that assert mutable present-world institutional practice or
 * unsupported scenario facts and keep the timeless/normative reasoning. Never invent replacements.
 */
export function stripUnsupportedCurrentClaimSentences(answer: string): string {
  const paragraphs = String(answer || '').split(/\n{2,}/)
  const cleaned = paragraphs.map(paragraph => {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+(?=[A-Z0-9*])/)
      .map(sentence => sentence.trim())
      .filter(Boolean)
      .filter(sentence => !sentenceNeedsRemoval(sentence))
    return sentences.join(' ').trim()
  }).filter(Boolean)
  return cleaned.join('\n\n').trim()
}
