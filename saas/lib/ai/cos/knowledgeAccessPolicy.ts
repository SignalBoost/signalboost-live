/**
 * Smart-human knowledge access.
 *   internal_first  — static / historical / method; use corpus, KG, memory
 *   live_required   — the fact moves on a clock; must look outside or refuse
 *   search_if_thin  — static catalog the model does not actually have; search,
 *                     then answer from what you found; never fail-close
 *
 * No @/ imports: raw Node tests.
 */

import { requiresFreshExternalEvidence } from './cosFreshnessPolicy.ts'
import { detectAdvisoryDiagnosisIntent } from './advisoryDiagnosisIntent.ts'
import { isNamedCatalogListRequest } from './listCatalogIntent.ts'

export type KnowledgeAccessMode = 'internal_first' | 'live_required' | 'search_if_thin'

export type KnowledgeAccessDecision = {
  mode: KnowledgeAccessMode
  reasons: string[]
}

const THIN_CATALOG = /(?:\blista\b|\blist of\b|\bme d[eê]\b|\benumere\b|\bnomeie\b).{0,120}(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bbairros?\b|\bruas?\b|\bpratos?\b|\bigrejas?\b)/i

export function classifyKnowledgeAccess(prompt: unknown): KnowledgeAccessDecision {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  const reasons: string[] = []
  if (!text) return { mode: 'internal_first', reasons: ['empty'] }

  if (detectAdvisoryDiagnosisIntent(text).isAdvisoryDiagnosis) {
    reasons.push('advisory-diagnosis')
    return { mode: 'internal_first', reasons }
  }

  if (isNamedCatalogListRequest(text) || THIN_CATALOG.test(text)) {
    reasons.push('thin-catalog')
    return { mode: 'search_if_thin', reasons }
  }

  if (requiresFreshExternalEvidence(text)) {
    reasons.push('freshness-policy')
    return { mode: 'live_required', reasons }
  }

  reasons.push('static-or-conceptual')
  return { mode: 'internal_first', reasons }
}

export function isSearchIfThinCatalog(prompt: unknown): boolean {
  return classifyKnowledgeAccess(prompt).mode === 'search_if_thin'
}

export const SMART_HUMAN_ACCESS_PROMPT_BLOCK = [
  'Knowledge access (owner rule): think like a careful person.',
  'If the fact is historical, definitional, or a method brief, use internal evidence first. Do not demand a live primary source.',
  'If the fact changes on a clock (flights, prices, scores, who holds office today), look outside. If the look fails, say so. Do not invent.',
  'If the ask is a catalog you do not actually have (for example 50 times da várzea), search public pages, keep distinct sourced names, label the list as published/cultural not a live federation roll, and never pad by repeating clubs or substituting professional first teams.',
  'Do not use the sentence “I did not release an answer because I could not stand behind one” for a catalog list.',
].join(' ')
