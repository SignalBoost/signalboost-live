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
export const FRESH_GROUNDED_ANSWER_MAX_TOKENS = 700
const LIVE_CITATION = /\[(LIVE\d+)\]/g

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
    'Answer the question directly, in prose, the way an informed person would after reading these sources. Lead with what the evidence establishes.',
    'For every current-world fact, use only the evidence supplied. Model memory is stale and must not supply dates, names, numbers, or outcomes.',
    'Cite inline with the evidence id in square brackets, e.g. [LIVE1], immediately after each fact it supports. Do not write URLs; the server appends the source list.',
    'Distinguish plainly: what is established by an official publisher, what is reported by media (say "as reported by" and that it is not officially confirmed), and what the evidence does not settle.',
    'If the question asks something the evidence cannot settle yet (a future outcome, an undecided result), never answer "insufficient": say it is undecided and report what IS established — stage, candidates, dates, declared results, dated figures with their source. Never turn a lead, a poll, or incumbency into a predicted or declared winner.',
    'If sources disagree, say what each one reports instead of choosing silently.',
    'Never mention routing, verification gates, confidence scores, providers, or fallbacks. Never describe your own process.',
    `CITATION REQUIREMENT (enforced by the server before release): ${describeFreshCitationRequirement(requirement, args.sources)}`,
    args.lengthRule || '',
  ].filter(Boolean).join('\n')
  const prompt = `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nQUESTION: ${args.input}\n\nAnswer now.`
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
export function acceptFreshEvidenceGroundedAnswer(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
}): FreshEvidenceGroundedAcceptance {
  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const raw = String(args.text || '').trim()
  const answer = raw.replace(LIVE_CITATION, (match, id: string) => byId.has(id) ? match : '').replace(/[ \t]{2,}/g, ' ').trim()
  const citedSourceIds: string[] = []
  for (const match of answer.matchAll(LIVE_CITATION)) {
    if (!citedSourceIds.includes(match[1])) citedSourceIds.push(match[1])
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

