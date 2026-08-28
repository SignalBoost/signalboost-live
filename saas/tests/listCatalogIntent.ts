/**
 * Named catalog / directory lists (amateur clubs, neighborhood teams).
 * These are not live scores or standings. Forcing a current-source lookup
 * fail-closed the owner prompt for 50 times da várzea de São Paulo.
 *
 * No @/ imports: raw Node tests.
 */

const LIST_ASK = /(?:\blista\b|\blist(?:a|e)?\b|\bgive me\b|\bme d[eê]\b|\bme passa\b|\bnome(?:ie|ia|ar)?\b|\benumere\b)/i
const TEAM_NOUN = /(?:\btimes?\b|\bclubes?\b|\bequipes?\b|\bteams?\b|\bclubs?\b|\besquadras?\b)/i
const AMATEUR_OR_PLACE = /(?:\bamador\b|\bv[aá]rzea\b|\bvarzea\b|\bamateur\b|\bs[aã]o paulo\b|\bsao paulo\b|\bsp\b|\bbairro\b|\bmunic[ií]pio\b)/i
const LIVE_SCORE_OVERRIDE = /(?:\bplacar\b|\bscore\b|\bstandings?\b|\bclassifica[cç][aã]o\b|\bhoje\b|\btoday\b|\bao vivo\b)/i

export function isNamedCatalogListRequest(prompt: unknown): boolean {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  if (LIVE_SCORE_OVERRIDE.test(text)) return false
  return LIST_ASK.test(text) && TEAM_NOUN.test(text) && AMATEUR_OR_PLACE.test(text)
}
