import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'

export type AcceptedFreshEvidenceSynthesis = {
  reply: string
  citedSourceIds: string[]
  answer: string
}

type ModelFreshEvidenceSynthesis = {
  answer?: unknown
  evidenceIds?: unknown
}

export const SINGLE_PROPOSITION_SOURCE_LIMIT = 2
export const SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT = 650

const GROUP_COMPARISON_CUE = /\b(?:between|btw|among|versus|vs\.?|compared\s+(?:with|to)|across)\b/i
const GROUP_DIFFERENCE_CUE = /\b(?:gap|difference|disparity|inequalit(?:y|ies)|inequit(?:y|ies)|discrimination|bias)\b/i
const GROUP_LEVEL_MEASURE_CUE = /\b(?:aggregate|overall|group[- ]level|median|unadjusted|raw|population)\b/i
const COMPARISON_BOUNDARY_CUE = /\b(?:does(?:\s+not|n't)|cannot|can't|is\s+not)\b[\s\S]{0,110}\b(?:by\s+itself\s+)?(?:prove|establish|show|demonstrate|determine|settle)\b[\s\S]{0,110}\b(?:individual|like[- ]for[- ]like|same\s+(?:job|work|role)|controlled|causal|legal|discriminat)/i

/** A group-level measurement must not become an individual, causal, controlled, or legal conclusion. */
export function requiresGroupComparisonScope(input: string): boolean {
  const text = String(input || '')
  return GROUP_DIFFERENCE_CUE.test(text) && GROUP_COMPARISON_CUE.test(text)
}

export function explainsGroupComparisonScope(answer: string): boolean {
  const text = String(answer || '')
  return GROUP_LEVEL_MEASURE_CUE.test(text) && COMPARISON_BOUNDARY_CUE.test(text)
}

function languageLabel(language: string): string {
  const normalized = String(language || 'en').toLowerCase()
  if (normalized === 'es') return 'Spanish'
  if (normalized === 'pt' || normalized === 'pt-br') return 'Portuguese'
  if (normalized === 'pl') return 'Polish'
  if (normalized === 'ru') return 'Russian'
  return 'English'
}

export function freshEvidenceSynthesisSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are reasoning over LIVE EVIDENCE retrieved moments ago. The evidence block is your ONLY permitted source of facts.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"]}.',
    'Rules, in order of priority:',
    '1. Use ONLY facts present in the evidence block. Your own memory is assumed stale and must not contribute facts.',
    '2. Put only the natural-language answer in "answer". Do NOT place URLs, markdown citations, or evidence labels inside the answer field.',
    '3. Put every evidence label that materially supports the answer in "evidenceIds". Never invent an evidence id.',
    '4. When the server-side authority policy requires independent corroboration, use the independent evidence ids supplied for that proposition.',
    '5. Resolve pronouns only from the explicit user context supplied in QUESTION; never infer a different person or entity from model memory.',
    '6. Infer the proposition directly from the user’s QUESTION. Do not accept a retrieval label, search query, control-plane fragment, or source headline as a substitute for the user’s meaning.',
    '7. Identify what each source actually measures or establishes before combining it with another source. Track constructs, populations, denominators, time windows, comparison bases, and controls when they materially affect interpretation.',
    '8. Keep materially different measurements distinct. Explain a material mismatch instead of presenting unlike measurements as interchangeable evidence.',
    '9. Distinguish observation from explanation. Do not infer causation, an individual outcome, or a controlled comparison from an aggregate or associative result unless the evidence itself establishes that stronger claim.',
    '10. For a broad group-comparison or difference question, first identify the level of claim the evidence actually establishes. If it establishes an aggregate difference, say that directly; do not silently upgrade it into a controlled, like-for-like, causal, or individual claim.',
    '10a. For a question about a disparity between populations, state the group-level measure and explicitly say that it does not by itself establish an individual, like-for-like, causal, controlled, or legal conclusion. Treat an adjusted analysis as a separate measurement whose controls and limits must be named from the evidence.',
    '11. Weigh evidence by directness, authority, methodological fit, and recency where relevant. Prefer the evidence that most directly establishes the requested proposition rather than the source with the strongest wording.',
    '12. When several sources play the same evidentiary role, choose the strongest representative one or two. Include additional statistics only when they change the scope, reveal disagreement, or answer a separate part of the question.',
    '13. Synthesize the answer around the conclusion, not around the retrieval set. Do not enumerate sources, repeat every statistic, or preserve retrieval order merely because the evidence was retrieved that way.',
    '14. For a yes/no factual question, lead with yes or no when supported, then state the scope of what was established and the most important limitation needed to avoid overclaiming.',
    '15. If one distinct claim is not established, say exactly which claim remains unverified while preserving any other grounded conclusion. Return EVIDENCE_INSUFFICIENT only when no material claim can be established from the evidence.',
    '16. When material sources disagree about the same proposition, report the disagreement and its scope instead of silently choosing a side.',
    '17. When the user asks for an evaluation, comparison, or ranking, identify the criterion actually supported by the evidence. Compare only like-for-like measurements; if the evidence uses incompatible criteria, explain that limitation rather than manufacture a single ranking.',
    '18. Preserve dates, populations, and measurement windows when they materially change the meaning of a quantitative claim.',
    '19. Before returning JSON, silently perform a synthesis check. If the draft is effectively one sentence per source, a list of retrieved statistics, or could be recreated by preserving retrieval order, rewrite it as conclusion → scope → limitation.',
    '20. Be brief, but use a compact numbered list when the question itself requests a list.',
    '21. State only what the evidence supports. Do not add praise, condemnation, protection, or a verdict that the evidence does not establish.',
  ].join('\n')
}

export function freshEvidenceSynthesisPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nREASONING TASK:\nInfer the proposition directly from QUESTION and synthesize the strongest relevant evidence into a conclusion-centered answer. Server-side claim research has already been used only to acquire evidence; it is intentionally not injected here because it must not redefine the user’s semantics.\n\nFor every historical/list claim, use the dated rows from the read document, not its title, navigation, or a different source's summary.\n\nQUESTION: ${args.input}`
}

/**
 * This is an output-quality boundary, not a semantic answer rule. It never chooses the conclusion.
 * A single-proposition answer that still cites a large retrieval set or remains unusually long gets
 * a second Qwen pass instead of being released as a search-result digest.
 */
export function freshEvidenceSynthesisNeedsNeuralReview(args: {
  input?: string
  answer: string
  citedSourceIds: string[]
  singleProposition: boolean
}): boolean {
  if (requiresGroupComparisonScope(args.input || '') && !explainsGroupComparisonScope(args.answer)) return true
  if (!args.singleProposition) return false
  return args.citedSourceIds.length > SINGLE_PROPOSITION_SOURCE_LIMIT
    || String(args.answer || '').trim().length > SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT
}

export function freshEvidenceRevisionSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are the SECOND NEURAL SYNTHESIS PASS for a grounded live-evidence answer.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"]}.',
    'The prior DRAFT is not evidence and is not authoritative. Re-reason from QUESTION and LIVE EVIDENCE.',
    'Use only facts in LIVE EVIDENCE. Never add a fact from model memory or from the draft unless the evidence independently contains it.',
    'Answer the user’s proposition, not the retrieval set. Abstract across sources before writing.',
    'For one proposition, select at most two representative evidence ids. If a correct grounded answer cannot be supported with at most two, return {"answer":"EVIDENCE_INSUFFICIENT","evidenceIds":[]}.',
    'Do not repeat parallel measurements, examples, occupations, subgroups, dates, or statistics merely to demonstrate that multiple sources were found.',
    'Write naturally and concisely: direct conclusion first, then only the scope and the most important limitation needed to prevent overclaiming. Do not label these as fixed sections.',
    'Distinguish aggregate observation from controlled comparison, individual outcome, explanation, and causation. State only the strongest level the evidence supports.',
    'For a disparity between populations, include both required parts: the group-level measure and a plain statement that it does not by itself establish an individual, like-for-like, causal, controlled, or legal conclusion. An adjusted result is a separate measurement, not proof of unlawful treatment.',
    'Never invent an evidence id. Do not put URLs or evidence labels inside the answer field.',
  ].join('\n')
}

export function freshEvidenceRevisionPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  draftAnswer: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nDRAFT THAT FAILED THE SYNTHESIS-QUALITY BOUNDARY (not evidence):\n${String(args.draftAnswer || '').trim()}\n\nREVIEW TASK:\nRe-reason from the original QUESTION and the evidence. Produce the smallest well-supported answer that states the conclusion, its actual evidentiary scope, and the key limitation without narrating the retrieval process.\n\nQUESTION: ${args.input}`
}

function parseJsonObject(text: string): ModelFreshEvidenceSynthesis | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? parsed as ModelFreshEvidenceSynthesis : null
  } catch {
    return null
  }
}

function answerRespectsRequestedWindow(answer: string, input: string, now = new Date()): boolean {
  const match = String(input || '').match(/\b(?:past|last)\s+(\d{1,3})\s+years?\b/i)
  if (!match) return true
  const startYear = now.getUTCFullYear() - Number(match[1])
  const ranges = [...String(answer || '').matchAll(/\b(\d{4})\s*[–-]\s*(\d{4})?\b/g)]
  // A claimed historical roster must contain dated rows, and no row may end before the window.
  // This rejects a real but stale archive being narrated as a current last-N-years roster.
  return ranges.length >= 2 && ranges.every(range => Number(range[2] || range[1]) >= startYear)
}

export function acceptFreshEvidenceSynthesis(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
  enforceGroupComparisonScope?: boolean
}): AcceptedFreshEvidenceSynthesis | null {
  const parsed = parseJsonObject(args.text)
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer || /EVIDENCE_INSUFFICIENT/i.test(answer)) return null
  if (!answerRespectsRequestedWindow(answer, args.input)) return null
  if (args.enforceGroupComparisonScope !== false
    && requiresGroupComparisonScope(args.input)
    && !explainsGroupComparisonScope(answer)) return null
  if (!Array.isArray(parsed?.evidenceIds)) return null

  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const citedSourceIds: string[] = []
  for (const rawId of parsed.evidenceIds) {
    const id = String(rawId || '').trim()
    if (!id || citedSourceIds.includes(id) || !byId.has(id)) continue
    citedSourceIds.push(id)
  }
  if (!citedSourceIds.length) return null

  const citations = citedSourceIds.map(id => {
    const source = byId.get(id)!
    return `[${source.id}] (${source.url})`
  })
  const reply = `${answer}\n\nSources: ${citations.join(' and ')}`

  // The server, not the model, owns citation rendering and enforces the evidence threshold.
  if (!replyCitesRequiredFreshEvidence(reply, args.input, args.sources)) return null
  return { reply, citedSourceIds, answer }
}
