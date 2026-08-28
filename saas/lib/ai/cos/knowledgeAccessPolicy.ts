/**
 * Smart-human knowledge access.
 *   internal_first  — static / historical / method; use corpus, KG, memory
 *   live_required   — the fact moves on a clock; must look outside or refuse
 *   search_if_thin  — externally checkable catalog/directory that COS does not actually have;
 *                     research public pages, then answer only from what was found
 *
 * No @/ imports: raw Node tests.
 */

import { requiresFreshExternalEvidence } from './cosFreshnessPolicy.ts'
import { detectAdvisoryDiagnosisIntent } from './advisoryDiagnosisIntent.ts'
import { isNamedCatalogResearchRequest } from './listCatalogIntent.ts'

export type KnowledgeAccessMode = 'internal_first' | 'live_required' | 'search_if_thin'

export type KnowledgeAccessDecision = {
  mode: KnowledgeAccessMode
  reasons: string[]
}

const THIN_CATALOG = /(?:\blista\b|\blist(?:\s+of)?\b|\bgive me\b|\bme d[eê]\b|\bme passa\b|\benumere\b|\bnomeie\b|\bname\b).{0,160}(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bclubs?\b|\bbairros?\b|\bneighbou?rhoods?\b|\bruas?\b|\bstreets?\b|\bpratos?\b|\bdishes?\b|\bigrejas?\b|\bchurches?\b|\brestaurantes?\b|\brestaurants?\b|\bmuseus?\b|\bmuseums?\b|\bparques?\b|\bparks?\b|\bescolas?\b|\bschools?\b|\bempresas?\b|\bcompanies?\b|\borganiza[cç][oõ]es?\b|\borganizations?\b)/i

export function classifyKnowledgeAccess(prompt: unknown): KnowledgeAccessDecision {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  const reasons: string[] = []
  if (!text) return { mode: 'internal_first', reasons: ['empty'] }

  if (detectAdvisoryDiagnosisIntent(text).isAdvisoryDiagnosis) {
    reasons.push('advisory-diagnosis')
    return { mode: 'internal_first', reasons }
  }

  // Clock-sensitive intent outranks the catalog rule. "Who is entered this weekend?" is live
  // verification; "give me 50 São Paulo várzea teams" is a public-reference research task.
  if (requiresFreshExternalEvidence(text)) {
    reasons.push('freshness-policy')
    return { mode: 'live_required', reasons }
  }

  if (isNamedCatalogResearchRequest(text) || THIN_CATALOG.test(text)) {
    reasons.push('thin-public-catalog')
    return { mode: 'search_if_thin', reasons }
  }

  reasons.push('static-or-conceptual')
  return { mode: 'internal_first', reasons }
}

export function isSearchIfThinCatalog(prompt: unknown): boolean {
  return classifyKnowledgeAccess(prompt).mode === 'search_if_thin'
}

export const SMART_HUMAN_ACCESS_PROMPT_BLOCK = [
  'Knowledge access (owner rule): think like a careful person.',
  'If the fact is historical, definitional, or a method brief, use internal evidence first.',
  'If the fact changes on a clock (flights, prices, scores, office holders, current entrants), verify it live and fail closed if the required authority is unavailable.',
  'If the user asks for a real-world catalog/directory that COS does not actually have, research public pages before answering. Keep only distinct names supported by the retrieved material; never pad a requested count with invented entities.',
  'Separate scope honestly: a published/cultural/reference list is not an official current roster, registration sheet, or this-weekend entrant list unless the retrieved source actually establishes that current status.',
  'Do not pretend public-web findings came from COS memory, Enterprise Memory, or a secret database.',
].join(' ')
