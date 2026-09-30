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

// GENERAL EXPLANATORY QUESTIONS (2026-09-30). Production 06:06 UTC, "What does a Kubernetes ClusterIP Service do?":
// RunPod read 11,880 prompt tokens and the turn took 18.6 s. About 20,000 of the ~46,000 characters of instructions
// govern owner tasks, decisions, approvals, deliverables, recommendations, figures, dates, code, statements to assess,
// pasted text to interpret, and incident diagnosis — none of which a question that only asks what something is or how
// it works involves. For such a question those blocks are left out (text of every kept line unchanged), and the
// prompt is identical from one such question to the next, so the RunPod server can reuse its cached prefix.
// Conservative: anything that looks like a task, a first-person situation, an incident, quoted text, a figure, a
// recommendation, a COS/platform term or a non-English question keeps the full prompt.
const EXPLANATORY_OPENING = /^(?:what|how|why|when|where|which|who|is|are|does|do|can|explain|describe|define|compare|contrast)\b/i

const NOT_EXPLANATORY_SIGNAL = /\b(?:i|me|my|mine|we|us|our|ours|you|your|should|must|need|needs|want|recommend\w*|advise|advice|decide|decision|approve\w*|choose|pick|best|create|write|draft|build|make|generate|fix|repair|send|email|post|publish|schedule|deploy|deploying|redeploy\w*|merge|commit|implement|script|design|review|audit|analy[sz]e|summari[sz]e|translate|rewrite|edit|plan|planning|prepare|help|give|show|list|run|execute|check|verify|test|debug\w*|troubleshoot\w*|diagnos\w*|investigat\w*|incident\w*|outage\w*|errors?|fail\w*|broken|bug|bugs|crash\w*|cause[sd]?|oom\w*|killed|evict\w*|slow\w*|timeouts?|leak\w*|stuck|hang\w*|alert\w*|customer\w*|client\w*|campaign\w*|sales|marketing|legal|law|laws|regulat\w*|complian\w*|gdpr|privacy|contract\w*|invoice\w*|hire|hiring|staff\w*|concierge|university|specialist\w*|artifact\w*|graduate\w*|residency|chief)\b/i

// "When would you use X?" addresses a generic practitioner, not COS or the owner's situation.
const GENERIC_PRACTITIONER_YOU = /\b(?:would|do|should|could|can|might|will) you (?:use|choose|pick|need|want|prefer|apply|configure|set up)\b/gi

const PROTECTED_LITERAL_SIGNAL = /\b(?:keep|kept|preserv\w*|exact\w*|unchanged|verbatim|literal\w*|conserv\w*)\b/i

const CODE_SIGNAL = /[`{}]|=>|\b(?:yaml|json|sql|regex|snippet|example|syntax|command|commands|cli|kubectl|manifest|code|function|program)\b/i

/** Placed in a prompt scoped for a general explanatory question; the reasoning workers read it to pick their compact discipline. */
export const EXPLANATORY_QUESTION_SCOPE_LINE = 'QUESTION SCOPE: a general explanatory question. Explain the concept directly and accurately; no task, decision, approval or deliverable is requested.'

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
  explanatory: boolean
  code: boolean
  protectedLiteral: boolean
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
  const givenFacts = quantitative || normative || text.length > 400
  const withoutGenericYou = text.replace(GENERIC_PRACTITIONER_YOU, ' ')
  const cosDefinitions = COS_SELF_SIGNAL.test(withoutGenericYou) || COS_SELF_SIGNAL.test(normalized.replace(GENERIC_PRACTITIONER_YOU, ' '))
  const languageProfile = nonLatinOrAccented ? null : selectedLanguageProfile(language)
  const explanatory = languageProfile === 'English'
    && !normative && !quantitative && !givenFacts && !cosDefinitions
    && text.length <= 300
    && (text.match(/\?/g) ?? []).length <= 1
    && EXPLANATORY_OPENING.test(text)
    && !NOT_EXPLANATORY_SIGNAL.test(withoutGenericYou)
    && !/["«»\u201c\u201d]|https?:\/\//.test(text)
  return Object.freeze({
    normative,
    quantitative,
    givenFacts,
    cosDefinitions,
    languageProfile,
    explanatory,
    code: CODE_SIGNAL.test(text),
    protectedLiteral: PROTECTED_LITERAL_SIGNAL.test(text),
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

/** Remove the lines from the first line starting with `startPrefix` up to (not including) the first later line starting with `endPrefix`. */
function dropBlockFrom(lines: string[], startPrefix: string, endPrefix: string): string[] {
  const start = lines.findIndex(line => line.startsWith(startPrefix))
  if (start < 0) return lines
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith(endPrefix)) end += 1
  if (end >= lines.length) return lines
  return [...lines.slice(0, start), ...lines.slice(end)]
}

// Lines inside otherwise-kept blocks that govern only incident diagnosis, statistical or social evidence, owner
// work completion, text interpretation, protected literals and non-English wording.
const NON_EXPLANATORY_LINE_PREFIXES = Object.freeze([
  '- For diagnostic or troubleshooting questions',
  '- Before writing a diagnosis',
  '- Illustrative "why it fits"',
  '- When asked to rank',
  '- Three causes named precisely',
  '- Naming a monitoring product',
  '- Before combining evidence',
  '- Keep materially different measurements',
  '- Distinguish observation from explanation',
  '- Weigh evidence by directness',
  '- Open with yes or no only when',
  '- For diagnosis and troubleshooting',
  '- Do not use evidence about an adjacent mechanism',
  '- Work end to end.',
  '- Completion means the whole cycle',
  '- Evidence discipline must not erase ordinary language understanding',
  '- A speaker does not need to state a conclusion',
  '- Infer the communicative task from meaning',
  '- For language or conversation interpretation',
  '- When the user explicitly says that a literal identifier',
  '- For non-English answers',
  'OWNER-PRIVILEGED TECHNICAL SELF-KNOWLEDGE',
  '- Primary reasoner:',
  '- Response token ceiling:',
  '- When the owner asks what SignalBoost or COS is',
])

function scopeToExplanatoryQuestion(input: string[], code: boolean, protectedLiteral: boolean): string[] {
  let lines = input
  // Owner Chief-of-Staff operations: work completion, strategy, authority, release audit (ROLE and COMMUNICATION stay).
  lines = dropBlockFrom(lines, 'WORK COMPLETION', 'COMMUNICATION')
  // Owner platform glossary (COS/platform terms keep it: those questions are never explanatory-scoped).
  const glossary = lines.findIndex(line => line.startsWith('OWNER-APPROVED PLATFORM GLOSSARY'))
  if (glossary >= 0) {
    const last = lines.findIndex((line, index) => index > glossary && line.startsWith('- When the owner asks about any of these terms'))
    if (last > glossary) lines = [...lines.slice(0, glossary), ...lines.slice(last + 1)]
  }
  // Self-improvement boundaries, business ideas, and how to engage with statements or pasted passages.
  lines = dropBlockFrom(lines, 'SELF-KNOWLEDGE AND IMPROVEMENT BOUNDARIES:', 'PROGRESSIVE PROACTIVE HELP:')
  lines = dropBlockFrom(lines, 'DECISION RIGHTS:', 'HOW YOU COMMUNICATE:')
  // Recommendations, figures, dates, and deliverables to produce.
  lines = dropBlockFrom(lines, 'RE-READ YOUR OWN ANSWER BEFORE RETURNING IT', code ? 'CODE YOU GENERATE MUST ACTUALLY RUN:' : 'AN UNSPECIFIED TASK SHAPE')
  lines = dropBlockFrom(lines, 'AN UNSPECIFIED TASK SHAPE', 'Reply in ')
  const protectedLine = '- When the user explicitly says that a literal identifier'
  lines = lines.filter(line => (protectedLiteral && line.startsWith(protectedLine)) || !NON_EXPLANATORY_LINE_PREFIXES.some(prefix => line.startsWith(prefix)))
  const reply = lines.findIndex(line => line.startsWith('Reply in '))
  return reply < 0 ? [...lines, EXPLANATORY_QUESTION_SCOPE_LINE] : [...lines.slice(0, reply), EXPLANATORY_QUESTION_SCOPE_LINE, ...lines.slice(reply)]
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

  if (scope.explanatory) lines = scopeToExplanatoryQuestion(lines, scope.code, scope.protectedLiteral)

  // Collapse runs of blank lines left behind by removed blocks.
  const out: string[] = []
  for (const line of lines) {
    if (!line.trim() && out.length && !out[out.length - 1].trim()) continue
    out.push(line)
  }
  return out.join('\n')
}