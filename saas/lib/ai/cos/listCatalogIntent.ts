/**
 * Named real-world catalog / directory requests.
 *
 * These requests are often NOT "current fact" questions — a cultural/reference list of
 * neighborhood football clubs is different from "who is entered this Sunday?" — but COS still
 * must not manufacture names from model memory when the requested catalog is thin or absent from
 * retained knowledge.
 *
 * Two routes intentionally coexist:
 * - amateur/neighborhood football club lists use the dedicated public-page catalog researcher in
 *   cosFirstAnswer.ts, which runs multiple public searches/pages to reach large requested counts
 *   without padding invented names;
 * - other named catalogs/directories fall through to knowledgeAccessPolicy as `search_if_thin`.
 *
 * No @/ imports: raw Node tests.
 */

const LIST_ASK = /(?:\blista\b|\blist(?:a|e)?\b|\blist of\b|\bgive me\b|\bme d[eê]\b|\bme passa\b|\bnome(?:ie|ia|ar)?\b|\benumere\b|\bname\b)/i
const NAMED_CATALOG_NOUN = /(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bclubs?\b|\besquadras?\b|\bassocia[cç][oõ]es?\b|\bassociations?\b|\bligas?\b|\bleagues?\b|\bbairros?\b|\bneighbou?rhoods?\b|\bruas?\b|\bstreets?\b|\bigrejas?\b|\bchurches?\b|\brestaurantes?\b|\brestaurants?\b|\bmuseus?\b|\bmuseums?\b|\bparques?\b|\bparks?\b|\bescolas?\b|\bschools?\b|\bempresas?\b|\bcompanies?\b|\borganiza[cç][oõ]es?\b|\borganizations?\b)/i
const REAL_WORLD_SCOPE = /(?:\bamador\b|\bv[aá]rzea\b|\bvarzea\b|\bamateur\b|\bbairro\b|\bmunic[ií]pio\b|\bcidade\b|\bcity\b|\bstate\b|\bestado\b|\bregion\b|\bregi[aã]o\b|\bin\s+[\p{L}]|\bde\s+[\p{L}]|\bdo\s+[\p{L}]|\bda\s+[\p{L}])/iu

const TEAM_NOUN = /(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bclubs?\b|\besquadras?\b)/i
const AMATEUR_FOOTBALL = /(?:\bfutebol\b|\bfootball\b|\bsoccer\b).{0,80}(?:\bamador\b|\bv[aá]rzea\b|\bvarzea\b|\bamateur\b|\bneighbou?rhood\b)|(?:\bamador\b|\bv[aá]rzea\b|\bvarzea\b|\bamateur\b|\bneighbou?rhood\b).{0,80}(?:\bfutebol\b|\bfootball\b|\bsoccer\b)/i
const SAMBA_SCHOOL_CATALOG = /(?:\bescolas?\s+de\s+samba\b|\bsamba\b).{0,80}(?:\bs[aã]o\s+paulo\b|\bsp\b|\bgrupo\s+(?:especial|1|primeiro)\b)|(?:\bs[aã]o\s+paulo\b|\bsp\b|\bgrupo\s+(?:especial|1|primeiro)\b).{0,80}(?:\bescolas?\s+de\s+samba\b|\bsamba\b)/i

const CURRENT_ROSTER_OVERRIDE = /(?:\bhoje\b|\btoday\b|\bagora\b|\bnow\b|\bcurrent\b|\bcurrently\b|\bthis\s+(?:week|weekend|season)\b|\beste\s+fim\s+de\s+semana\b|\binscrit[oa]s?\b|\bentrants?\b|\broster\b|\bstandings?\b|\bscore\b|\bplacar\b)/i

/**
 * A catalog whose authoritative pages contain a roster/list that must be read, not guessed from snippets.
 * This is intentionally not a claim that a historical cultural catalog is a live event entry list.
 */
export function isPublicPageExtractionCatalogRequest(prompt: unknown): boolean {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text || CURRENT_ROSTER_OVERRIDE.test(text)) return false
  return LIST_ASK.test(text) && SAMBA_SCHOOL_CATALOG.test(text)
}

export function isNamedCatalogResearchRequest(prompt: unknown): boolean {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  return LIST_ASK.test(text) && NAMED_CATALOG_NOUN.test(text) && REAL_WORLD_SCOPE.test(text)
}

/**
 * Dedicated public-page researcher for large amateur/neighborhood football lists. It is deliberately
 * NOT used for current entrants/scores/standings, which belong to the stricter live-current path.
 */
export function isNamedCatalogListRequest(prompt: unknown): boolean {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text || CURRENT_ROSTER_OVERRIDE.test(text)) return false
  return LIST_ASK.test(text) && TEAM_NOUN.test(text) && AMATEUR_FOOTBALL.test(text) && REAL_WORLD_SCOPE.test(text)
}
