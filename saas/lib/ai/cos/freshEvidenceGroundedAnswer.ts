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
  | 'no_evidence_cited'
  | 'citation_requirement_unmet'

/** Interactive lane budget (ONBOARD 2026-09-27: main answer 20 s, thinking off). */
export const FRESH_GROUNDED_ANSWER_TIMEOUT_MS = 20_000
/**
 * ~200 words. Production 2026-10-10 19:56: the one call that finished took 19.4 s for exactly 700 output tokens
 * (finish=length) at the pod's ~36 tok/s; every other attempt timed out at 20 s on both providers. Answer length
 * is latency (ONBOARD 2026-09-27); the length rule asks for ~150 words, the cap now matches it.
 */
export const FRESH_GROUNDED_ANSWER_MAX_TOKENS = 350
/**
 * Evidence budget for the reasoning call. The same turn carried 9,422 prompt tokens because claim research
 * replaces each source's snippet with up to 24,000 characters of page body and all of it was sent to the
 * model (the pod's window is 8,192 tokens, so it refused outright and the backup then timed out on prefill).
 * The model needs the passages that bear on the question, not the page: ~1,200 chars per source, 6,000 total.
 */
export const FRESH_GROUNDED_EVIDENCE_CHARS_PER_SOURCE = 1_200
export const FRESH_GROUNDED_EVIDENCE_CHARS_TOTAL = 6_000
const LIVE_CITATION = /\[(LIVE\d+)\]/g
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
  const systemPrompt = [
    'You are COS. Live web evidence was retrieved by the server moments ago for the question below. Reason over it and answer. /no_think',
    `Answer in ${reportLanguageName(args.language)} unless the question is clearly written in another language; then answer in that language.`,
    'Answer the question directly in the first sentence. Never narrate your analysis, inspect individual LIVE sources aloud, or open with Let me analyze, First I need to, or similar process commentary.',
    `The current UTC year is ${new Date().getUTCFullYear()}. Treat that year as the current year, not as a future date.`,
    'For every current-world fact, use only the evidence supplied. Model memory is stale and must not supply dates, names, numbers, or outcomes.',
    'Cite inline with the evidence id in square brackets, e.g. [LIVE1], immediately after each fact it supports. Do not write URLs; the server appends the source list.',
    'Distinguish plainly: what is established by an official publisher, what is reported by media (say "as reported by" and that it is not officially confirmed), and what the evidence does not settle.',
    'If the question asks something the evidence cannot settle yet (a future outcome, an undecided result), never answer "insufficient": say it is undecided and report what IS established — stage, candidates, dates, declared results, dated figures with their source. Never turn a lead, a poll, or incumbency into a predicted or declared winner.',
    'If sources disagree, say what each one reports instead of choosing silently.',
    'Never mention routing, verification gates, confidence scores, providers, or fallbacks. Never describe your own process.',
    `CITATION REQUIREMENT (enforced by the server before release): ${describeFreshCitationRequirement(requirement, args.sources)}`,
    args.lengthRule || '',
  ].filter(Boolean).join('\n')
  const compact = compactFreshEvidenceForReasoning(args.sources, args.input)
  const prompt = `${freshEvidenceGroundingBlock(args.input, compact, args.retrievedAt)}\n\nQUESTION: ${args.input}\n\nAnswer now.`
  return { systemPrompt, prompt }
}

/** Flat result (repo rule: tsconfig strict:false, unions do not narrow). `reason` is null when ok. */
export type FreshEvidenceGroundedAcceptance = {
  ok: boolean
  reason: FreshEvidenceGroundingRejection | null
  reply: string
  answer: string
  citedSourceIds: string[]
}

/**
 * Deterministic acceptance limited to what deterministic code can verify. Citations the model
 * invented (ids that were never retrieved) are removed rather than failing the whole answer; an
 * answer that cites nothing used no evidence and is not released as a live answer.
 */
/**
 * A length-capped answer ends mid-sentence. Cut back to the last sentence end when that keeps most of the
 * text; otherwise keep it as is (a short answer cut inside its first sentence is better than nothing).
 */
export function trimToCompleteSentence(text: string): string {
  const value = String(text || '').trim()
  if (!value || /[.!?…。！？]["”')\]]?$/u.test(value)) return value
  let cut = -1
  for (const m of value.matchAll(/[.!?…。！？]["”')\]]?(?=\s)/gu)) cut = (m.index ?? -1) + m[0].length
  if (cut >= Math.ceil(value.length * 0.6)) return value.slice(0, cut).trim()
  return value
}

export function acceptFreshEvidenceGroundedAnswer(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
}): FreshEvidenceGroundedAcceptance {
  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const raw = trimToCompleteSentence(String(args.text || ''))
  const answer = raw.replace(LIVE_CITATION, (match, id: string) => byId.has(id) ? match : '').replace(/[ \t]{2,}/g, ' ').trim()
  const citedSourceIds: string[] = []
  for (const match of answer.matchAll(LIVE_CITATION)) {
    if (!citedSourceIds.includes(match[1])) citedSourceIds.push(match[1])
  }
  // Refuse a model answer which calls a previous year the current date on a
  // live question. This is an explicit stale-date contradiction, not a ban on
  // mentioning historical years as background.
  const currentYear = new Date().getUTCFullYear()
  const staleCurrentYear = /(?:as of (?:the )?(?:current date|today|now)\s*[,(: -]*|current (?:year|date|term)\s*(?:is|:|\()\s*)(20\d{2})/gi
  const staleAsOf = /\bas of\s+(?:the\s+)?(?:year\s+)?(20\d{2})\b/gi
  const staleFutureFraming = /\b(?:still\s+)?(?:in\s+the\s+future|future\s+event)\s*\(\s*as of\s+(20\d{2})\s*\)/gi
  const narration = /^(?:let me (?:analy[sz]e|review|examine|go through)|first,? i need to|i(?:'ll| will) (?:analy[sz]e|review|check) the evidence|let's go through each piece of evidence)/i
  if (narration.test(answer) || [...answer.matchAll(staleAsOf)].some(match => Number(match[1]) !== currentYear)
    || [...answer.matchAll(staleFutureFraming)].some(match => Number(match[1]) !== currentYear)
    || [...answer.matchAll(staleCurrentYear)].some(match => Number(match[1]) !== currentYear)) {
    return { ok: false, reason: 'citation_requirement_unmet', reply: '', answer, citedSourceIds }
  }
  if (!answer) return { ok: false, reason: 'empty_answer', reply: '', answer, citedSourceIds }
  if (hasUnsafePublicModelOutput(answer)) return { ok: false, reason: 'unsafe_public_output', reply: '', answer, citedSourceIds }
  if (!citedSourceIds.length) return { ok: false, reason: 'no_evidence_cited', reply: '', answer, citedSourceIds }
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
  const instruction = args.reason === 'citation_requirement_unmet'
    ? `Your draft was not released because it did not meet the citation requirement. ${describeFreshCitationRequirement(requirement, args.sources)} Rewrite the answer so that it cites evidence ids from the required number of different hosts wherever they support the same point; do not add facts the evidence does not contain.`
    : args.reason === 'no_evidence_cited'
      ? 'Your draft was not released because it cited no evidence id. Rewrite the answer citing [LIVE#] ids inline after each fact they support.'
      : 'Your draft was not released. Rewrite the answer from the evidence, citing [LIVE#] ids inline.'
  return {
    systemPrompt: base.systemPrompt,
    prompt: `${base.prompt}\n\nPREVIOUS DRAFT (not evidence):\n${String(args.draft || '').trim()}\n\nREPAIR: ${instruction}`,
  }
}

