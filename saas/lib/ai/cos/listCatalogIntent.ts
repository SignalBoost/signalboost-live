/**
 * Named real-world catalog / directory requests.
 *
 * These requests are often NOT "current fact" questions — a cultural/reference list of
 * neighborhood football clubs is different from "who is entered this Sunday?" — but COS still
 * must not manufacture names from model memory when the requested catalog is thin or absent from
 * retained knowledge. The governed knowledge-access layer classifies these as `search_if_thin` and
 * researches public pages before answering.
 *
 * `isNamedCatalogListRequest` is retained only as a compatibility hook for the old direct catalog
 * interceptor in cosFirstAnswer.ts. It intentionally returns false so that brittle regex harvesting
 * cannot bypass COS evidence-grounded synthesis. New code should use
 * `isNamedCatalogResearchRequest`.
 *
 * No @/ imports: raw Node tests.
 */

const LIST_ASK = /(?:\blista\b|\blist(?:a|e)?\b|\blist of\b|\bgive me\b|\bme d[eê]\b|\bme passa\b|\bnome(?:ie|ia|ar)?\b|\benumere\b|\bname\b)/i
const NAMED_CATALOG_NOUN = /(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bclubs?\b|\besquadras?\b|\bassocia[cç][oõ]es?\b|\bassociations?\b|\bligas?\b|\bleagues?\b|\bbairros?\b|\bneighbou?rhoods?\b|\bruas?\b|\bstreets?\b|\bigrejas?\b|\bchurches?\b|\brestaurantes?\b|\brestaurants?\b|\bmuseus?\b|\bmuseums?\b|\bparques?\b|\bparks?\b|\bescolas?\b|\bschools?\b|\bempresas?\b|\bcompanies?\b|\borganiza[cç][oõ]es?\b|\borganizations?\b)/i
const REAL_WORLD_SCOPE = /(?:\bamador\b|\bv[aá]rzea\b|\bvarzea\b|\bamateur\b|\bbairro\b|\bmunic[ií]pio\b|\bcidade\b|\bcity\b|\bstate\b|\bestado\b|\bregion\b|\bregi[aã]o\b|\bin\s+[\p{L}]|\bde\s+[\p{L}]|\bdo\s+[\p{L}]|\bda\s+[\p{L}])/iu

export function isNamedCatalogResearchRequest(prompt: unknown): boolean {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  return LIST_ASK.test(text) && NAMED_CATALOG_NOUN.test(text) && REAL_WORLD_SCOPE.test(text)
}

/**
 * Legacy compatibility hook. Returning false is deliberate: the old direct path harvested
 * capitalized phrases with a regex and could misclassify page prose as entity names. Catalogs now
 * fall through to classifyKnowledgeAccess(...).mode === 'search_if_thin', which performs public
 * research and COS evidence-only synthesis instead.
 */
export function isNamedCatalogListRequest(_prompt: unknown): boolean {
  return false
}
