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

import type { SearchResult } from '@/lib/ai/tools/getExternalInfo'
import {
  FRESH_SELECTED_EVIDENCE_BUDGET,
  freshEvidenceGroundingBlock as baseFreshEvidenceGroundingBlock,
  freshEvidenceHost,
  freshEvidenceMeetsAuthority as baseFreshEvidenceMeetsAuthority,
  prepareFreshEvidenceAcrossQueries as basePrepareFreshEvidenceAcrossQueries,
  freshEvidenceSearchQueries as baseFreshEvidenceSearchQueries,
  freshEvidenceSearchQuery,
  type FreshEvidenceSource,
} from './cosFreshGroundingBase.ts'
import { requiresLiveTravelPlanningEvidence } from './cosFreshnessPolicy.ts'

const EVALUATIVE_RANKING = /\b(?:best|greatest|top|worst|worse|most\s+successful|least\s+successful|rank(?:ing|ings|ed)?|overrated|underrated|melhor|maior|pior|mais\s+bem[- ]?sucedid[oa]|mejor|peor|m[aá]s\s+exitos[oa]|najlepsz\w*|najgorsz\w*|ranking\w*|лучший|лучшая|лучшие|худший|худшая|рейтинг\w*)\b/iu
const OFFICE_OR_EXECUTIVE_ROLE = /\b(?:president|vice\s+president|prime\s+minister|premier|chancellor|governor|mayor|secretary\s+of\s+state|attorney\s+general|speaker|minister|monarch|king|queen|pope|chief\s+executive\s+officer|ceo|chief\s+financial\s+officer|cfo|chief\s+information\s+officer|cio|chief\s+technology\s+officer|cto|chair(?:man|woman)?)\b/i
const SPORTS_DOMAIN = /\b(?:football|soccer|futebol|fútbol|futbol|piłk\w*|футбол\w*|basketball|basquete|baloncesto|koszyk\w*|баскетбол\w*|baseball|beisebol|b[eé]isbol|hockey|h[oó]quei|cricket|rugby|r[uú]gbi|volleyball|voleibol|siatk\w*|nba|wnba|nfl|mlb|nhl|epl|premier\s+league|champions\s+league|libertadores|sudamericana|brasileir[aã]o|s[eé]rie\s+a|league|liga|campeonato|championship)\b/iu

const TRAVEL_TRANSPORT_SIGNAL = /\b(?:airport|transport|transit|train|rail|bus|coach|metro|tram|ferry|fare|ticket|station|public transport|airport express|lotnisk\p{L}*|transport\p{L}*|poci[aą]g\p{L}*|autobus\p{L}*|tramwaj\p{L}*|bilet\p{L}*|dworzec|aeropuerto|transporte|tren|autob[uú]s|billete|aeroporto|comboio|trem|autocarro|[oô]nibus|bilhete|аэропорт|транспорт|поезд|автобус|метро|трамва\p{L}*|билет\p{L}*)\b/iu
const TRAVEL_ATTRACTION_SIGNAL = /\b(?:museum|museums|attraction|attractions|sight|sights|tourism|visitor|opening hours|admission|reservation|booking|ticket price|muze\p{L}*|atrakcj\p{L}*|zwiedzani\p{L}*|godzin\p{L}* otwarcia|rezerwacj\p{L}*|museo|atracci[oó]n|turismo|horario|reserva|museu|atra[cç][aã]o|turismo|hor[aá]rio|reserva|музе\p{L}*|достопримечательност\p{L}*|туризм|бронирован\p{L}*)\b/iu
const TRAVEL_GENERAL_SIGNAL = /\b(?:travel|tourist|tourism|visitor|city card|day pass|hotel|accommodation|journey|trip|podr[oó]ż\p{L}*|turyst\p{L}*|viaje|viagem|путешеств\p{L}*)\b/iu

function travelEvidenceText(result: Pick<SearchResult, 'title' | 'url' | 'snippet'>): string {
  return `${result.title || ''} ${result.url || ''} ${result.snippet || ''}`
}

function travelEvidenceRelevant(result: Pick<SearchResult, 'title' | 'url' | 'snippet'>): boolean {
  const text = travelEvidenceText(result)
  return TRAVEL_TRANSPORT_SIGNAL.test(text) || TRAVEL_ATTRACTION_SIGNAL.test(text) || TRAVEL_GENERAL_SIGNAL.test(text)
}

function asksTravelTransport(input: string): boolean {
  return TRAVEL_TRANSPORT_SIGNAL.test(String(input || ''))
}

function asksTravelAttractions(input: string): boolean {
  return TRAVEL_ATTRACTION_SIGNAL.test(String(input || ''))
}

function travelSearchSeed(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, 150)
}

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
  if (requiresLiveTravelPlanningEvidence(input)) {
    const primary = freshEvidenceSearchQuery(input, now)
    const seed = travelSearchSeed(input)
    const date = now.toISOString().slice(0, 10)
    return [...new Set([
      primary,
      `${seed} official airport city transport train bus metro fares schedules ${date}`,
      `${seed} official city public transport day pass fares tickets ${date}`,
      `${seed} official tourism museums attractions ticket prices opening hours reservations ${date}`,
    ].map(query => query.replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean))]
  }

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
export function prepareFreshEvidenceAcrossQueries(
  resultGroups: SearchResult[][],
  totalBudget = FRESH_SELECTED_EVIDENCE_BUDGET,
  query = '',
): FreshEvidenceSource[] {
  if (!requiresLiveTravelPlanningEvidence(query)) {
    return basePrepareFreshEvidenceAcrossQueries(resultGroups, totalBudget, query)
  }
  const relevantGroups = resultGroups.map(results => results.filter(travelEvidenceRelevant))
  return basePrepareFreshEvidenceAcrossQueries(relevantGroups, totalBudget, query)
}

export function freshEvidenceMeetsAuthority(input: string, sources: FreshEvidenceSource[]): boolean {
  if (requiresLiveTravelPlanningEvidence(input)) {
    if (!sources.length) return false
    const needsTransport = asksTravelTransport(input)
    const needsAttractions = asksTravelAttractions(input)
    const hasTransport = sources.some(source => TRAVEL_TRANSPORT_SIGNAL.test(travelEvidenceText(source)))
    const hasAttractions = sources.some(source => TRAVEL_ATTRACTION_SIGNAL.test(travelEvidenceText(source)))
    const hosts = new Set(sources.map(source => freshEvidenceHost(source.url)).filter(Boolean))
    if (needsTransport && !hasTransport) return false
    if (needsAttractions && !hasAttractions) return false
    return hosts.size >= 2 || sources.length >= 3
  }
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
