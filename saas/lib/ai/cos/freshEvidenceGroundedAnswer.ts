// saas/lib/ai/cos/freshEvidenceGroundedAnswer.ts
//
// Pure (no transport, relative imports only — testable under the node runner): the single-pass
// grounded-answer prompt, the host's citation requirement stated to the model, and the
// deterministic acceptance limited to what deterministic code can verify. See
// freshEvidenceLocalSynthesis.ts for the rationale and the transport.
import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { describeFreshCitationRequirement, freshCitationRequirement, replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'
import { hasUnsafePublicModelOutput } from './publicPromptSecurity.ts'
import { reportLanguageName } from '../../i18n/reportLanguage.ts'

export type FreshEvidenceGroundingRejection =
  | 'empty_answer'
  | 'unsafe_public_output'
  | 'process_narration'
  | 'no_evidence_cited'
  | 'citation_requirement_unmet'

/** Interactive lane budget (ONBOARD 2026-09-27: main answer 20 s, thinking off). */
export const FRESH_GROUNDED_ANSWER_TIMEOUT_MS = 20_000
/** Transport safety ceiling, not an instruction to shorten the user-facing answer. */
export const FRESH_GROUNDED_ANSWER_MAX_TOKENS = 1200
/**
 * Evidence budget for the reasoning call. The same turn carried 9,422 prompt tokens because claim research
 * replaces each source's snippet with up to 24,000 characters of page body and all of it was sent to the
 * model (the pod's window is 8,192 tokens, so it refused outright and the backup then timed out on prefill).
 * The model needs the passages that bear on the question, not the page: ~1,200 chars per source, 6,000 total.
 */
export const FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE = 900
export const FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL = 4_500
const LIVE_CITATION = /\[(LIVE\d+)\]/g
export function normalizeLiveCitations(text: string): string {
  return String(text || '')
    .replace(/[【(（{]\s*(LIVE\s*\d+(?:\s*[,;/&]\s*(?:LIVE\s*)?\d+)*)\s*[】)）}]/gi, '[$1]')
    .replace(/\[\s*(LIVE\s*\d+(?:\s*[,;/&]\s*(?:LIVE\s*)?\d+)*)\s*\]/gi, (_m, inner: string) =>
      (inner.match(/\d+/g) || []).map(n => '[LIVE' + Number(n) + ']').join(''))
    .replace(/(?<![\w\[])\bLIVE\s*(\d+)\b(?!\])/gi, (_m, n: string) => '[LIVE' + Number(n) + ']')
}
const EXCERPT_STOP = new Set(['about', 'after', 'again', 'because', 'before', 'being', 'between', 'could', 'current', 'during', 'every', 'first', 'former', 'from', 'have', 'into', 'latest', 'might', 'official', 'other', 'please', 'should', 'since', 'their', 'there', 'these', 'thing', 'think', 'those', 'through', 'today', 'under', 'until', 'where', 'which', 'while', 'would'])

/** Question words as match stems: 'brazilian' → 'brazil', 'president' → 'presid', so inflections in the page match. */
function questionTerms(input: string): string[] {
  const seen = new Set<string>()
  for (const token of String(input || '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []) {
    if (EXCERPT_STOP.has(token)) continue
    seen.add(token.length > 6 ? token.slice(0, 6) : token)
  }
  return [...seen]
}

/**
 * Keep the passages of a source that bear on the question, in document order, within a character budget.
 * Deterministic selection of WHICH text the model sees; never a rewrite of it. A source with no matching
 * passage keeps its opening text, so a terse official page is not emptied.
 */
export function excerptEvidenceForQuestion(snippet: string, input: string, budget: number): string {
  const text = String(snippet || '').replace(/\s+/g, ' ').trim()
  if (text.length <= budget) return text
  const units = text.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(\[])/u).map(unit => unit.trim()).filter(Boolean)
  const terms = questionTerms(input)
  const picked: string[] = []
  let used = 0
  for (const unit of units) {
    const lower = unit.toLowerCase()
    if (!terms.some(term => lower.includes(term))) continue
    const piece = unit.length > budget ? unit.slice(0, budget) : unit
    if (used + piece.length + 1 > budget) break
    picked.push(piece)
    used += piece.length + 1
  }
  if (picked.length) return picked.join(' ')
  return text.slice(0, budget)
}

/** The sources as the model sees them: same ids, titles, urls and dates; excerpted passages instead of pages. */
export function compactFreshEvidenceForReasoning(sources: FreshEvidenceSource[], input: string): FreshEvidenceSource[] {
  if (!sources.length) return []
  const perSource = Math.max(240, Math.min(FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE, Math.floor(FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL / sources.length)))
  return sources.map(source => ({ ...source, snippet: excerptEvidenceForQuestion(source.snippet, input, perSource) }))
}

export type FreshEvidenceGroundedPrompt = { systemPrompt: string; prompt: string }

export function freshEvidenceGroundedAnswerPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
  /** The host's chat length rule (CHAT_ANSWER_LENGTH_RULE); injected by the transport layer. */
  lengthRule?: string
}): FreshEvidenceGroundedPrompt {
  const requirement = freshCitationRequirement(args.input, args.sources)
  // Keep the default instructions short. On unrelated queries, long election-specific
  // warnings consume the output budget and encourage small models to review policy aloud.
  const isElectionQuestion = /\b(?:election|president|presidential|runoff|candidate|vote|voting|senate|house|congress|majority|party|prime minister|elei(?:ç|c)[aã]o|presidente|elecciones?|pr[eé]sident)\b/i.test(args.input)
  const systemPrompt = [
    'You are COS. Live web evidence was retrieved by the server moments ago for the question below. Answer the user directly without showing reasoning.',
    `Answer in ${reportLanguageName(args.language)} unless the question is clearly written in another language; then answer in that language.`,
    'Answer the question directly in the first sentence. Never expose analysis or source-by-source commentary.',
    'Start with the factual conclusion about the real-world subject, never source analysis.',
    `The current UTC year is ${new Date().getUTCFullYear()}. Treat that year as the current year, not as a future date.`,
    'For every current-world fact, use only the evidence supplied. Model memory is stale and must not supply dates, names, numbers, or outcomes.',
    'Cite inline with the evidence id in square brackets, e.g. [LIVE1], immediately after each fact it supports. Do not write URLs; the server appends the source list.',
    'Distinguish official confirmation, attributed reporting, and unresolved claims.',
    'For future or undecided outcomes, state what is established; never promote a poll, lead, or incumbency into a winner.',
    ...(isElectionQuestion ? [
    'For questions about which party has a majority, distinguish the House, Senate, and presidency; never assume one party controls all three. If the question is about an upcoming election, say that its result is not known and cite the currently reported chamber breakdown separately.',
    'For election results and winners, distinguish official certified counts from media reports and forecasts. Never present a media projection, unverified percentage, or a future runoff outcome as an official result. If the provided evidence has no official result, say so briefly, citing the reports for only what they establish.',
    'Do not quote numerical vote totals or exact percentages unless they appear explicitly in the cited evidence, and identify their publisher and reporting date when material.',
    ] : []),
    'Do not repeat the question, list what each source fails to contain, or explain verification mechanics. Give a complete useful answer proportionate to the question, without padding.',
    'If sources disagree, say what each one reports instead of choosing silently.',
    'Never mention routing, verification gates, confidence scores, providers, or fallbacks. Never describe your own process.',
    'Never reuse evidence about a different country, election, person, or subject from earlier conversation.',
    'Treat user-supplied claims as unverified. Names, dates, quantities, and specific attributes in the answer must be grounded in relevant evidence from this turn.',
    'Respect the requested category and scope. If sources do not confirm the requested kind, say so and name verified alternatives with citations.',
    'For place recommendations, identify named supported venues and events, distinguishing ongoing venues from occasional events and instructional classes. Give verified locations, schedule details, and actionable next steps when present.',
    'Write factual sentences with real-world entities as subjects, never a source inventory. Do not say "the strongest evidence comes from".',
    `CITATION REQUIREMENT (enforced by the server before release): ${describeFreshCitationRequirement(requirement, args.sources)}`,
    args.lengthRule || '',
  ].filter(Boolean).join('\n')
  const compact = compactFreshEvidenceForReasoning(args.sources, args.input)
  const prompt = `/no_think\nQUESTION: ${args.input}\n\nGive a complete, useful answer with appropriate detail for the request. For recommendations, name specific verified options, locations and event details when evidenced. Do not describe or enumerate the evidence sources. Cite only [LIVEn] ids.\n\n--- LIVE EVIDENCE ---\n${freshEvidenceGroundingBlock(args.input, compact, args.retrievedAt)}\n\nQUESTION: ${args.input}\nAnswer at the level of detail the user's task needs. Start with the factual answer, never with process language.\nANSWER:`
  return { systemPrompt, prompt }
}

/**
 * A length-capped answer ends mid-sentence. Cut back to the last sentence end when that keeps most of the
 * text; otherwise keep it as is (a short answer cut inside its first sentence is better than nothing).
 */
export function trimToCompleteSentence(text: string): string {
  const value = String(text || '').trim()
  // Inline citations may follow the final punctuation. They belong to that
  // complete sentence and must never be trimmed off as an unfinished tail.
  if (!value || /[.!?…。！？]["”')\]]?\s*(?:\[LIVE\d+\]\s*)*$/u.test(value)) return value
  let cut = -1
  for (const m of value.matchAll(/[.!?…。！？]["”')\]]?(?:\s*\[LIVE\d+\])*(?=\s|$)/gu)) cut = (m.index ?? -1) + m[0].length
  if (cut >= Math.ceil(value.length * 0.6)) return value.slice(0, cut).trim()
  return value
}

/**
 * Sentence-level release filter (2026-10-11). The previous gate was a growing list of opener phrases and
 * rejected the WHOLE draft when any line matched one, so every new way the model phrased its reasoning
 * killed an otherwise grounded answer. Instead, each sentence or list item is classified by what it is
 * about: the model's own process (first person, the task, the question/user, a source inventory) is never
 * published; a sentence about the world is published only when it cites a retrieved source and carries
 * words, not just an id. The draft is rejected only when no cited factual sentence survives.
 */
const LIST_ITEM = /^\s*(?:[-*•–]|\d+[.)])\s+/
const SENTENCE_BOUNDARY = /([.!?…。！？]["”')\]]*)((?:\s*\[LIVE\d+\](?!\s*(?:[:\-–]|\p{Ll})))*)(\s+|$)/gu
const ABBREVIATION_BEFORE = /(?:^|[\s(])\p{Lu}[\p{L}]{0,2}$/u
const FIRST_PERSON_CASED_I = /(?:^|[^\p{L}'])I(?:'m|'ll|'ve|'d)?(?=$|[^\p{L}'])/u
const FIRST_PERSON_WORDS = /(?:^|[^\p{L}'])(?:let me|let's|let us|we|we're|we'll|we've|our)(?=$|[^\p{L}'])/iu
const TASK_REFERENCE = /\b(?:the|this|that|my|your|their) (?:user|user's|question|query|prompt|instructions?|draft|final answer)\b|\b(?:el usuario|la pregunta|o usuário|a pergunta)\b/i
const SOURCE_SUBJECT = /^\s*(?:[-*•–]\s*)?\[LIVE\d+\]/
const PROCESS_OPENER = /^\s*(?:[-*•–]\s*)?(?:okay|ok|alright|hmm|wait|looking at|analy[sz]ing|checking|reviewing|scanning|going through|examining|first,? (?:i|we)\b)/i
/**
 * A citation used as a noun inside the sentence ("comes from [LIVE1] and [LIVE2] which name studios",
 * "[LIVE2] lists academies") makes the sentence about the sources, not the world. A sentence that reports
 * what the sources say and cites them at the end ("The sources describe lessons, not a nightclub [LIVE2].")
 * is a factual answer and is kept. Replaces a fixed opener-phrase list that rejected that honest answer.
 */
// Source inventory subjects are not user-facing conclusions, even with syntactically valid citations.
// Keep this independent of topical nouns and of citation positioning.
const SOURCE_INVENTORY_SUBJECT = /^\s*(?:(?:the|these|those|our)\s+)?(?:(?:strongest|best|main|key|primary|direct|available|retrieved|most\s+relevant)\s+)*(?:evidence|sources?|search\s+results?|references?|citations?)\s+(?:is|are|comes?|names?|lists?|shows?|says?|identifies?|describes?|mentions?|supports?|indicates?|suggests?)\b/i

const CITATION_AS_NOUN = /\b(?:from|see|cites?|citing)\s+\[LIVE\d+\]|\[LIVE\d+\]\s+(?:(?:and|or|&)\s+\[LIVE\d+\]\s+)?(?:which|that|explicitly|clearly|only|both|each|shows?|says?|names?|lists?|mentions?|describes?|discusses?)\b/i

export function isProcessNarrationUnit(unit: string): boolean {
  const text = String(unit || '')
  return SOURCE_INVENTORY_SUBJECT.test(text)
    || CITATION_AS_NOUN.test(text)
    || SOURCE_SUBJECT.test(text)
    || PROCESS_OPENER.test(text)
    || TASK_REFERENCE.test(text)
    || FIRST_PERSON_CASED_I.test(text)
    || FIRST_PERSON_WORDS.test(text)
}

/** Sentences of one prose line; trailing citations stay with the sentence they support. */
export function splitAnswerSentences(line: string): string[] {
  const units: string[] = []
  let start = 0
  for (const m of line.matchAll(SENTENCE_BOUNDARY)) {
    const index = m.index ?? 0
    const before = line.slice(start, index)
    if (m[1] === '.' && !m[2] && ABBREVIATION_BEFORE.test(before)) continue
    units.push(line.slice(start, index + m[1].length + m[2].length).trim())
    start = index + m[0].length
  }
  if (start < line.length) units.push(line.slice(start).trim())
  return units.filter(Boolean)
}

function hasWords(unit: string): boolean {
  return (unit.replace(LIVE_CITATION, ' ').match(/\p{L}{2,}/gu) || []).length >= 1
}

/** Flat result (repo rule: tsconfig strict:false, unions do not narrow). `reason` is null when ok. */
export type FreshEvidenceGroundedAcceptance = {
  ok: boolean
  reason: FreshEvidenceGroundingRejection | null
  reply: string
  answer: string
  citedSourceIds: string[]
}

export function acceptFreshEvidenceGroundedAnswer(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
}): FreshEvidenceGroundedAcceptance {
  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const modelText = String(args.text || '')
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .trim()
  // An explicit final-answer marker at a line start ends the model's preamble.
  const finalMarker = [...modelText.matchAll(/(?:^|\n)\s*(?:final answer|answer)\s*:\s*/gi)].at(-1)
  const publicText = finalMarker ? modelText.slice((finalMarker.index || 0) + finalMarker[0].length) : modelText
  // A harmless attribution preface is not reasoning; drop the phrase, keep the claim.
  const cleanPublicText = publicText.replace(/^\s*(?:based on (?:the )?(?:retrieved |live )?sources?|according to (?:the )?(?:retrieved |live )?(?:sources|evidence))\s*[,.:–-]\s*/i, '')
  const normalized = trimToCompleteSentence(normalizeLiveCitations(cleanPublicText))
    .replace(LIVE_CITATION, (match, id: string) => byId.has(id) ? match : '')

  let sawNarration = false
  const keptLines: string[] = []
  const lines = normalized.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/[ \t]{2,}/g, ' ').trimEnd()
    if (!line.trim()) continue
    const units = LIST_ITEM.test(line) ? [line.trim()] : splitAnswerSentences(line)
    const kept: string[] = []
    for (const unit of units) {
      if (isProcessNarrationUnit(unit)) { sawNarration = true; continue }
      if (/\[LIVE\d+\]/.test(unit) && hasWords(unit)) kept.push(unit)
    }
    if (kept.length) { keptLines.push(kept.join(' ')); continue }
    // An uncited lead-in to a cited list ("Several venues host salsa nights:") introduces facts, it is not one.
    const nextLine = lines.slice(i + 1).find(next => next.trim())
    if (units.length === 1 && /:\s*$/.test(line) && !isProcessNarrationUnit(line) && nextLine && LIST_ITEM.test(nextLine) && /\[LIVE\d+\]/.test(nextLine) && !isProcessNarrationUnit(nextLine)) {
      keptLines.push(line.trim())
    }
  }
  // A lead-in never stands alone.
  while (keptLines.length && /:\s*$/.test(keptLines[keptLines.length - 1])) keptLines.pop()
  const answer = keptLines.join('\n').trim()
  const citedSourceIds: string[] = []
  for (const match of answer.matchAll(LIVE_CITATION)) {
    if (!citedSourceIds.includes(match[1])) citedSourceIds.push(match[1])
  }
  if (!answer) {
    const reason: FreshEvidenceGroundingRejection = sawNarration ? 'process_narration' : /\[LIVE\d+\]/.test(normalized) || !normalized.trim() ? 'empty_answer' : 'no_evidence_cited'
    return { ok: false, reason, reply: '', answer: '', citedSourceIds: [] }
  }
  // Refuse a model answer which calls a previous year the current date on a live question.
  const currentYear = new Date().getUTCFullYear()
  const staleCurrentYear = /(?:as of (?:the )?(?:current date|today|now)\s*[,(: -]*|current (?:year|date|term)\s*(?:is|:|\()\s*)(20\d{2})/gi
  const staleAsOf = /\bas of\s+(?:the\s+)?(?:year\s+)?(20\d{2})\b/gi
  const staleFutureFraming = /\b(?:still\s+)?(?:in\s+the\s+future|future\s+event)\s*\(\s*as of\s+(20\d{2})\s*\)/gi
  if ([...answer.matchAll(staleAsOf)].some(match => Number(match[1]) !== currentYear)
    || [...answer.matchAll(staleFutureFraming)].some(match => Number(match[1]) !== currentYear)
    || [...answer.matchAll(staleCurrentYear)].some(match => Number(match[1]) !== currentYear)) {
    return { ok: false, reason: 'citation_requirement_unmet', reply: '', answer, citedSourceIds }
  }
  if (hasUnsafePublicModelOutput(answer)) return { ok: false, reason: 'unsafe_public_output', reply: '', answer, citedSourceIds }
  const citations = citedSourceIds.map(id => `[${id}] (${byId.get(id)!.url})`)
  const reply = `${answer}\n\nSources: ${citations.join(' and ')}`
  if (!replyCitesRequiredFreshEvidence(reply, args.input, args.sources)) {
    return { ok: false, reason: 'citation_requirement_unmet', reply: '', answer, citedSourceIds }
  }
  return { ok: true, reason: null, reply, answer, citedSourceIds }
}

/** One concrete repair instruction: what was missing, in terms the model can act on. */
export function freshEvidenceGroundedRepairPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
  lengthRule?: string
  draft: string
  reason: FreshEvidenceGroundingRejection
}): FreshEvidenceGroundedPrompt {
  const base = freshEvidenceGroundedAnswerPrompt(args)
  const requirement = freshCitationRequirement(args.input, args.sources)
  const instruction = args.reason === 'process_narration'
    ? 'The previous draft contained process narration and cannot be published. Write a completely new answer. Start with the direct factual conclusion; add at most two supporting sentences citing [LIVEn]. Do not inspect sources aloud, summarize individual source contents, or reuse the rejected draft.'
    : args.reason === 'citation_requirement_unmet'
    ? `Your draft was not released because it did not meet the citation requirement. ${describeFreshCitationRequirement(requirement, args.sources)} Rewrite the answer so that it cites evidence ids from the required number of different hosts wherever they support the same point; do not add facts the evidence does not contain.`
    : args.reason === 'no_evidence_cited'
      ? 'Your draft was not released because it cited no evidence id. Rewrite the answer citing [LIVE#] ids inline after each fact they support.'
      : 'Your draft was not released. Rewrite the answer from the evidence, citing [LIVE#] ids inline.'
  if (args.reason === 'process_narration') {
    // Production runpod/Qwen keeps generating self-analysis after the long policy prompt.
    // The retry must change the stimulus, not repeat that prompt with more prohibitions.
    const evidence = compactFreshEvidenceForReasoning(args.sources, args.input)
    return {
      systemPrompt: [
        'You write only the final response to a user, never the analysis or a source inventory. /no_think',
        `Reply in ${reportLanguageName(args.language)}. Use only the supplied LIVE evidence.`,
        'Answer the exact category asked; do not turn schools into clubs or predictions into results.',
        'If no evidence confirms the exact requested thing, say that it is unconfirmed and name only clearly supported alternatives. Do not rename a related category as the one requested.',
        'Every factual sentence requires its supporting [LIVE#] citation. Never invent facts or citations.',
        'Write about the real-world answer, not the sources. Format example (not a factual claim): "The available information does not confirm the requested type; it identifies related alternatives [LIVE1] [LIVE2]." Never say "the strongest evidence comes from" or enumerate which LIVE source says what.',
        `CITATION REQUIREMENT: ${describeFreshCitationRequirement(requirement, args.sources)}`,
      ].join('\n'),
      prompt: `/no_think\nTASK: Answer the user's question in one or two factual sentences, citing LIVE IDs. Output only the answer. No source-by-source analysis or planning.\nQUESTION: ${args.input}\n\n${freshEvidenceGroundingBlock(args.input, evidence, args.retrievedAt)}\n\nQUESTION: ${args.input}\nRESPONSE:`,
    }
  }
  return {
    systemPrompt: base.systemPrompt,
    prompt: `${base.prompt.replace(/\nANSWER:\s*$/, '')}\n\n${args.draft?.trim() ? `PREVIOUS DRAFT (not evidence):\n${args.draft.trim()}\n\n` : ''}REPAIR: ${instruction}\nANSWER:`,
  }
}

