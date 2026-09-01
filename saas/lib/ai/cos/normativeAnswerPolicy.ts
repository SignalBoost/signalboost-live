const PERSONAL_OR_OPERATIONAL_ADVICE = /^\s*(?:should|ought)\s+(?:i|we|you)\b/i
const SHOULD_POLICY_FORM = /^\s*(?:should|ought)\s+(?!i\b|we\b|you\b)[^?]{1,180}\??\s*$/i
const EXPLICIT_VALUE_FORM = /^\s*(?:is|are)\s+[^?]{0,140}\b(?:right|wrong|ethical|unethical|moral|immoral|fair|unfair|acceptable|justified|permissible)\b/i
const PUBLIC_ELIGIBILITY_FORM = /\b(?:play|compete|participate|serve|enroll|attend|work)\b[^?]{0,80}\b(?:categor(?:y|ies)|division|league|sports?|military|public office|school|university|workplace)\b/i
const PUBLIC_CHOICE_FORM = /\b(?:legal(?:ize|ized|ization)?|illegal|allow(?:ed)?|permit(?:ted)?|ban(?:ned)?|prohibit(?:ed)?|require(?:d)?|mandatory|recognize(?:d)?|right\s+to|deserve(?:s|d)?|entitled\s+to|abolish(?:ed)?|criminalize(?:d)?)\b/i
const BINARY_LEAD = /^\s*(?:yes|no|sí|si|não|nao|tak|nie|да|нет)(?:\s|[,.!:;?—–-]|$)/iu
const CONTRAST = /\b(?:however|while|whereas|by contrast|on the other hand|supporters?|opponents?|arguments?\s+(?:for|against)|competing|depends?\s+on|counterargument|nevertheless)\b/i

/** A value-policy question, distinct from a request asking only what the current law says. */
export function isNormativePolicyQuestion(input: string): boolean {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text || PERSONAL_OR_OPERATIONAL_ADVICE.test(text)) return false
  return EXPLICIT_VALUE_FORM.test(text)\n    || (SHOULD_POLICY_FORM.test(text) && (PUBLIC_CHOICE_FORM.test(text) || PUBLIC_ELIGIBILITY_FORM.test(text)))
}

/**
 * Deterministic release boundary for English normative answers. Prompt instructions establish the
 * same contract in every supported language; these checks make the observed English failure class
 * impossible to release or enter the answer cache.
 */
export function normativeAnswerContractViolations(input: string, answer: string): string[] {
  if (!isNormativePolicyQuestion(input)) return []
  const text = String(answer || '').trim()
  const violations: string[] = []
  if (BINARY_LEAD.test(text)) violations.push('normative_binary_lead')
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 100) violations.push('normative_answer_underdeveloped')
  if (!CONTRAST.test(text)) violations.push('normative_competing_frameworks_missing')
  return violations
}

export const NORMATIVE_ANSWER_POLICY: readonly string[] = [
  'NORMATIVE AND PUBLIC-POLICY QUESTIONS:',
  '- When the user asks what should be legal, allowed, prohibited, required, moral, ethical, fair, right, or wrong, never begin with Yes or No and never present one value judgment as a settled factual verdict.',
  '- Give a substantive neutral analysis. Separate current descriptive facts (including law, evidence, and public opinion when relevant) from the competing normative principles and arguments.',
  '- Present the strongest material arguments supporting and opposing the proposition fairly, with distinct current sources for each side. Do not create false balance: if a material side lacks credible evidence, say so rather than inventing support. The user must not be told which moral or political position to adopt.',
  '- End by identifying what the evidence establishes and what depends on the reader\'s ethical, legal, religious, political, or rights-based framework. Do not evade the question with a generic disclaimer.',
]
