//
// SCOPE THE ANSWER INSTRUCTIONS TO THE QUESTION (2026-09-29, owner goal: chat answers in under 10 seconds).
//
// Production 2026-09-30 00:33 UTC, "How does Kubernetes keep applications reliable when a node goes down…":
// the owned RunPod reasoner refused the call in 6 ms with context_window_budget_insufficient, and the paid
// managed backup took 29.4 s. Cause: every chat question carried the full ~57K-character answer prompt
// (~19K estimated tokens, plus the ~10K-character reasoning discipline added by the workers), which does not
// fit the RunPod reasoner window and makes every provider read ~20K tokens before writing one word.
//
// Most of that prompt governs question classes the current question is not in: public-policy questions,
// calculations, the pinned engineering constants, the given-facts/own-reading contract for long scenarios,
// the COS component definitions, and the writing profiles of four languages the answer is not written in.
// Those blocks now go in only when the question calls for them. Their text is unchanged, and when no
// question is supplied the prompt is returned exactly as before.
//
// Conservative by design: any doubt keeps the block. Digits, units, money, and calculation words keep the
// quantitative blocks; "you"/"COS"/memory words keep the COS definitions; long scenarios keep given-facts.

import { ENGINEERING_CONSTANTS } from './engineeringConstants.ts'
import { NORMATIVE_ANSWER_POLICY, isNormativePolicyQuestion } from './normativeAnswerPolicy.ts'
import { englishNormalizedForClassification } from './crossLanguageFreshness.ts'

const QUANTITATIVE_SIGNAL = /\d|[%$€£¥]|\b(?:calculat\w*|comput\w*|estimat\w*|how\s+(?:much|many|long|big|fast|often)|cost\w*|pric\w*|budget\w*|rate|rates|ratio\w*|percent\w*|capacity|throughput|latency|sizing|size|power|watts?|kw|kwh|mw|gpu\w*|bandwidth|storage|forecast\w*|roi|revenue|margin\w*|payback|tco|per\s+(?:hour|day|week|month|year|second|user|unit)|convert\w*|units?|metric\w*|kpi\w*|salary|price|profit\w*|loss|growth|average|median|probability|odds|statistic\w*|equation|formula|math\w*|arithmetic|sum|total|compare\s+\w+\s+cost|cu[aá]nto\w*|quanto\w*|ile|сколько|coste|costo|custo|koszt\w*|стоимост\w*|calcul\w*|oblicz\w*|рассчит\w*|precio|preço|cena)\b/iu

const COS_SELF_SIGNAL = /\b(?:cos|itmounts|signalboost|you|your|yours|yourself|memory|memories|cache|cached|knowledge\s+graph|corpus|skills?|learn\w*|train\w*|model|models|platform|provenance|citation\w*|reasoner|brain)\b/i

const LANGUAGE_PROFILE_LINE = /^- (English|Spanish|Brazilian Portuguese|Polish|Russian): /

const LANGUAGE_BY_CODE: Readonly<Record<string, string>> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  pl: 'Polish',
  ru: 'Russian',
}

export type ReasonerPromptScope = Readonly<{
  normative: boolean
  quantitative: boolean
  givenFacts: boolean
  cosDefinitions: boolean
  languageProfile: string | null
}>

function selectedLanguageProfile(language: string | null | undefined): string | null {
  const raw = String(language || '').trim().toLowerCase()
  if (!raw) return 'English'
  // Codes such as "en", "es-MX", "pt_BR".
  if (/^[a-z]{2}(?:[-_][a-z]{2,4})?$/.test(raw)) return LANGUAGE_BY_CODE[raw.slice(0, 2)] ?? null
  if (raw.startsWith('english')) return 'English'
  if (raw.startsWith('spanish') || raw.startsWith('español') || raw.startsWith('espanol')) return 'Spanish'
  if (raw.includes('portug')) return 'Brazilian Portuguese'
  if (raw.startsWith('polish') || raw.startsWith('polski')) return 'Polish'
  if (raw.startsWith('russian')) return 'Russian'
  // Unknown language: keep every profile.
  return null
}

/** Decide which question-class blocks this question needs. Pure and deterministic. */
export function reasonerPromptScopeFor(question: string, language?: string | null): ReasonerPromptScope {
  const text = String(question || '').replace(/\s+/g, ' ').trim()
  const normalized = englishNormalizedForClassification(text)
  const normative = isNormativePolicyQuestion(normalized) || isNormativePolicyQuestion(text)
  const quantitative = QUANTITATIVE_SIGNAL.test(text) || QUANTITATIVE_SIGNAL.test(normalized)
  // Non-ASCII questions may be written in a language the profile selector did not pick; keep every profile.
  const nonLatinOrAccented = /[^\u0000-\u007f]/.test(text)
  return Object.freeze({
    normative,
    quantitative,
    givenFacts: quantitative || normative || text.length > 400,
    cosDefinitions: COS_SELF_SIGNAL.test(text) || COS_SELF_SIGNAL.test(normalized),
    languageProfile: nonLatinOrAccented ? null : selectedLanguageProfile(language),
  })
}

function nonBlank(lines: readonly string[]): Set<string> {
  return new Set(lines.map(line => line.trim()).filter(Boolean))
}

const NORMATIVE_LINES = nonBlank(NORMATIVE_ANSWER_POLICY)
const CONSTANT_LINES = nonBlank(ENGINEERING_CONSTANTS)

/** Remove the lines from `startHeader` up to (not including) the first line starting with `endHeader`. */
function dropBlock(lines: string[], startHeader: string, endHeader: string): string[] {
  const start = lines.indexOf(startHeader)
  if (start < 0) return lines
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith(endHeader)) end += 1
  if (end >= lines.length) return lines
  return [...lines.slice(0, start), ...lines.slice(end)]
}

/**
 * Return the reasoner prompt with the question-class blocks this question does not need removed.
 * With no question, the prompt is returned unchanged.
 */
export function scopeReasonerPromptToQuestion(prompt: string, question?: string | null, language?: string | null): string {
  if (!String(question || '').trim()) return prompt
  const scope = reasonerPromptScopeFor(String(question), language)
  let lines = prompt.split('\n')

  if (!scope.normative) lines = lines.filter(line => !NORMATIVE_LINES.has(line.trim()))
  if (!scope.quantitative) {
    lines = dropBlock(lines, 'QUANTITATIVE WORK AND STATED CONSTRAINTS:', 'DELIVER CONCLUSIONS, NOT YOUR DELIBERATION:')
    lines = lines.filter(line => !CONSTANT_LINES.has(line.trim()))
  }
  if (!scope.givenFacts) {
    lines = dropBlock(lines, 'GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY:', 'RE-READ YOUR OWN ANSWER BEFORE RETURNING IT')
  }
  if (!scope.cosDefinitions) {
    lines = lines.filter(line => !(
      (line.startsWith('AUTHORITATIVE COS DEFINITIONS: ') && !line.startsWith('AUTHORITATIVE COS DEFINITIONS: iTMounts'))
      || line.startsWith('SCOPE RULE: ')
      || line.startsWith('These AUTHORITATIVE COS DEFINITIONS are foundational')
    ))
  }
  if (scope.languageProfile) {
    lines = lines.filter(line => {
      const match = LANGUAGE_PROFILE_LINE.exec(line)
      return !match || match[1] === scope.languageProfile
    })
  }

  // Collapse runs of blank lines left behind by removed blocks.
  const out: string[] = []
  for (const line of lines) {
    if (!line.trim() && out.length && !out[out.length - 1].trim()) continue
    out.push(line)
  }
  return out.join('\n')
}
