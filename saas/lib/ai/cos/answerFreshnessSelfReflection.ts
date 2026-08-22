// Answer-side freshness self-reflection.
//
// A prompt can be timeless/normative while the draft answer quietly introduces mutable present-day
// claims ("current industry standards", "most regulators", "the prevailing approach"). Prompt-only
// freshness routing cannot catch that class. This module is deliberately pure: it detects those
// answer-side claims and provides a conservative deterministic fallback that removes them if a local
// repair pass cannot produce a clean answer.

const EXPLICIT_CURRENT_MARKER = /\b(?:current(?:ly)?|latest|today|right\s+now|present[- ]day|modern[- ]day|recent(?:ly)?|as\s+of\s+20\d{2})\b/i
const MUTABLE_INSTITUTIONAL_TOPIC = /\b(?:industry\s+standards?|legal\s+frameworks?|regulatory\s+frameworks?|regulatory\s+bodies|regulators?|engineering\s+priorities|industry\s+practice|standard\s+practice|prevailing\s+approach|prevailing\s+practice|manufacturers?|companies|agencies|jurisdictions|courts|governments?)\b/i
const MUTABLE_GENERALIZATION = /\b(?:most|many|major|leading|industry|regulatory)\s+(?:manufacturers?|companies|regulators?|regulatory\s+bodies|agencies|jurisdictions|courts|governments?)\b/i
const PRACTICE_ASSERTION = /\b(?:generally|typically|usually|commonly|widely|mostly)\s+(?:prioriti[sz]e|require|follow|use|adopt|prohibit|allow|prefer|treat|consider)\b/i
const PREVAILING_ASSERTION = /\b(?:prevailing|dominant|standard|industry[- ]wide)\s+(?:approach|practice|view|policy|rule|standard)\b/i

export type AnswerFreshnessSignal = {
  code: 'explicit_current_marker' | 'mutable_institutional_claim' | 'mutable_generalization' | 'practice_assertion' | 'prevailing_assertion'
  excerpt: string
}

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string): string {
  return compact(text).slice(0, 220)
}

export function answerFreshnessSignals(answer: string): AnswerFreshnessSignal[] {
  const text = compact(answer)
  if (!text) return []
  const out: AnswerFreshnessSignal[] = []
  if (EXPLICIT_CURRENT_MARKER.test(text) && MUTABLE_INSTITUTIONAL_TOPIC.test(text)) {
    out.push({ code: 'explicit_current_marker', excerpt: excerpt(text) })
  }
  if (MUTABLE_INSTITUTIONAL_TOPIC.test(text) && /\b(?:prioriti[sz]e|require|follow|use|adopt|prohibit|allow|prefer|govern|regulat|approach|practice)\w*\b/i.test(text)) {
    out.push({ code: 'mutable_institutional_claim', excerpt: excerpt(text) })
  }
  if (MUTABLE_GENERALIZATION.test(text)) out.push({ code: 'mutable_generalization', excerpt: excerpt(text) })
  if (PRACTICE_ASSERTION.test(text)) out.push({ code: 'practice_assertion', excerpt: excerpt(text) })
  if (PREVAILING_ASSERTION.test(text)) out.push({ code: 'prevailing_assertion', excerpt: excerpt(text) })
  return out
}

export function answerNeedsFreshnessReflection(answer: string): boolean {
  return answerFreshnessSignals(answer).length > 0
}

function sentenceNeedsRemoval(sentence: string): boolean {
  return answerNeedsFreshnessReflection(sentence)
}

/**
 * Last-resort safety fallback. Local self-reflection should normally rewrite the answer coherently.
 * If it cannot, remove only sentences that assert mutable present-world institutional practice and
 * keep the timeless/normative reasoning. Never invent replacement facts.
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
