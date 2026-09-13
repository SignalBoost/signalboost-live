// Compatibility wrapper around the established fresh-grounding implementation.
// The base file preserves all mature deterministic evidence/citation logic; this layer fixes
// evaluative sports research so a question such as "What is the best football team in Brazil?"
// cannot be mistaken for an office-holder evaluation and sent to unemployment/CPI/GDP research.
//
// Inherited neural-evidence contract (kept explicit because deployment architecture gates read this canonical module):
// The evidence does not define the question.
// Infer the proposition from the user’s wording.
// Keep materially different constructs, populations, denominators, time windows distinct.
// Synthesize the strongest relevant evidence into the answer without hard-coded verdicts.

export * from './cosFreshGroundingBase.ts'

import {
  freshEvidenceGroundingBlock as baseFreshEvidenceGroundingBlock,
  freshEvidenceHost,
  freshEvidenceMeetsAuthority as baseFreshEvidenceMeetsAuthority,
  freshEvidenceSearchQueries as baseFreshEvidenceSearchQueries,
  freshEvidenceSearchQuery,
  type FreshEvidenceSource,
} from './cosFreshGroundingBase.ts'

const EVALUATIVE_RANKING = /\b(?:best|greatest|top|worst|worse|most\s+successful|least\s+successful|rank(?:ing|ings|ed)?|overrated|underrated|melhor|maior|pior|mais\s+bem[- ]?sucedid[oa]|mejor|peor|m[aá]s\s+exitos[oa]|najlepsz\w*|najgorsz\w*|ranking\w*|лучший|лучшая|лучшие|худший|худшая|рейтинг\w*)\b/iu
const OFFICE_OR_EXECUTIVE_ROLE = /\b(?:president|vice\s+president|prime\s+minister|premier|chancellor|governor|mayor|secretary\s+of\s+state|attorney\s+general|speaker|minister|monarch|king|queen|pope|chief\s+executive\s+officer|ceo|chief\s+financial\s+officer|cfo|chief\s+information\s+officer|cio|chief\s+technology\s+officer|cto|chair(?:man|woman)?)\b/i
const SPORTS_DOMAIN = /\b(?:football|soccer|futebol|fútbol|futbol|piłk\w*|футбол\w*|basketball|basquete|baloncesto|koszyk\w*|баскетбол\w*|baseball|beisebol|b[eé]isbol|hockey|h[oó]quei|cricket|rugby|r[uú]gbi|volleyball|voleibol|siatk\w*|nba|wnba|nfl|mlb|nhl|epl|premier\s+league|champions\s+league|libertadores|sudamericana|brasileir[aã]o|s[eé]rie\s+a|league|liga|campeonato|championship)\b/iu

/** True only for an evaluative question about a public office/executive role. */
export function isPersonOrOfficeEvaluation(input: string): boolean {
  const text = String(input || '')
  return EVALUATIVE_RANKING.test(text) && OFFICE_OR_EXECUTIVE_ROLE.test(text)
}

/** Evaluative team/sport questions need comparative sports evidence, not macroeconomic series. */
export function isSportsTeamEvaluation(input: string): boolean {
  const text = String(input || '')
  return EVALUATIVE_RANKING.test(text) && SPORTS_DOMAIN.test(text)
}

function cleanEvaluationTopic(input: string): string {
  return String(input || '')
    .replace(/[?!.]+$/g, '')
    .replace(EVALUATIVE_RANKING, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

/**
 * Build a bounded multi-query research plan for evaluative sports questions. The loop deliberately
 * gathers distinct evidence dimensions instead of asking the search engine for an opinion verdict.
 */
export function freshEvidenceSearchQueries(input: string, now = new Date()): string[] {
  if (!isSportsTeamEvaluation(input)) return baseFreshEvidenceSearchQueries(input, now)

  const primary = freshEvidenceSearchQuery(input, now)
  const subject = cleanEvaluationTopic(input) || String(input || '').trim()
  return [...new Set([
    primary,
    `${subject} official domestic league champions recent seasons titles`,
    `${subject} official current league standings season`,
    `${subject} official continental international championship titles history`,
  ].map(query => query.replace(/\s+/g, ' ').trim().slice(0, 260)).filter(Boolean))]
}

/**
 * A "best" sports answer should not rest on one search result. Two independent hosts are preferred;
 * three separately selected evidence pages from one governing source are also enough to continue to
 * neural synthesis rather than incorrectly claiming that no information exists.
 */
export function freshEvidenceMeetsAuthority(input: string, sources: FreshEvidenceSource[]): boolean {
  if (!isSportsTeamEvaluation(input)) return baseFreshEvidenceMeetsAuthority(input, sources)
  if (sources.length < 2) return false
  const hosts = new Set(sources.map(source => freshEvidenceHost(source.url)).filter(Boolean))
  return hosts.size >= 2 || sources.length >= 3
}

/** Add a reasoning contract for subjective/evaluative sports comparisons after live retrieval. */
export function freshEvidenceGroundingBlock(input: string, sources: FreshEvidenceSource[], retrievedAt: string): string {
  const base = baseFreshEvidenceGroundingBlock(input, sources, retrievedAt)
  if (!isSportsTeamEvaluation(input)) return base
  return [
    base,
    '',
    'EVALUATIVE SPORTS COMPARISON RULES:',
    '1. Words such as "best" or "greatest" are criteria-dependent unless the user supplied one exact metric. Do not pretend there is an official universal winner.',
    '2. Do not refuse merely because different sources emphasize different clubs or eras. That is expected for an evaluative comparison, not a factual contradiction.',
    '3. Use the retrieved evidence to compare multiple relevant dimensions when available: recent domestic performance, historical domestic titles, continental/international success, and current standing/form.',
    '4. Lead with the qualification, then identify the strongest evidence-backed candidate or candidates and explain why. Distinguish recent dominance from all-time historical strength.',
    '5. Never invent a title count, winning streak, current position, or championship result that is absent from the live evidence.',
    '6. If one dimension is unsupported by the retrieved evidence, omit that dimension and answer with the supported criteria instead of declaring that no information exists.',
  ].join('\n')
}
