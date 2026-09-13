// saas/lib/cos-core/layers/learning/learningLanguage.ts
/**
 * Relevance for a study gap is decided by term overlap between the document and the gap's subject
 * and question, both of which are written in English. For every subject except one that is the
 * right test. For a LANGUAGE gap it is exactly backwards: the material that teaches Polish is
 * written in Polish and contains none of the English anchors, so it scores zero coverage and is
 * discarded, while an English article ABOUT Polish matches and is admitted.
 *
 * Measured over one production window the two language subjects rejected 82-83% of everything
 * retrieved as not_relevant, against 19-46% for every other subject.
 *
 * A document written in the target language is on-topic for a gap whose objective is to learn that
 * language. Detection is stopword-frequency based: no dependency, no model call, and deliberately
 * conservative — an uncertain document falls through to the ordinary term-overlap test rather than
 * being admitted on a guess. Nothing here relaxes a confidence floor or an admission threshold.
 */

const STOPWORDS: Record<string, readonly string[]> = {
  en: ['the', 'and', 'that', 'with', 'for', 'this', 'from', 'which', 'have', 'not', 'are', 'was', 'they', 'their'],
  es: ['que', 'de', 'la', 'el', 'en', 'los', 'las', 'por', 'con', 'para', 'una', 'del', 'se', 'no'],
  pt: ['que', 'de', 'da', 'do', 'em', 'os', 'as', 'por', 'com', 'para', 'uma', 'não', 'se', 'mais'],
  pl: ['nie', 'się', 'jest', 'oraz', 'przez', 'jako', 'tego', 'które', 'żeby', 'aby', 'lub', 'ych', 'ale', 'tym'],
  ru: ['и', 'в', 'не', 'на', 'что', 'с', 'по', 'как', 'это', 'для', 'но', 'или', 'то', 'из'],
}

/** Minimum text length before a language verdict is meaningful. */
const MIN_DETECTION_CHARS = 240

function tokenise(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}]+/gu) || []
}

function stopwordRate(tokens: string[], language: string): number {
  const list = STOPWORDS[language]
  if (!list || !tokens.length) return 0
  const set = new Set(list)
  let hits = 0
  for (const token of tokens) if (set.has(token)) hits += 1
  return hits / tokens.length
}

/**
 * Returns the dominant language code, or null when no language is clearly ahead. Ambiguity is
 * reported honestly rather than resolved to a best guess, because a wrong verdict here would admit
 * off-topic material into a curriculum.
 */
export function detectDominantLanguage(text: string): string | null {
  const body = String(text || '')
  if (body.length < MIN_DETECTION_CHARS) return null
  const tokens = tokenise(body)
  if (tokens.length < 60) return null
  const scored = Object.keys(STOPWORDS)
    .map(language => ({ language, rate: stopwordRate(tokens, language) }))
    .sort((a, b) => b.rate - a.rate)
  const [best, runnerUp] = scored
  if (!best || best.rate < 0.03) return null
  if (runnerUp && best.rate < runnerUp.rate * 1.5) return null
  return best.language
}

/** True when the document is written in the gap's target language. */
export function documentMatchesTargetLanguage(text: string, targetLanguage: string | null | undefined): boolean {
  const target = String(targetLanguage || '').trim().toLowerCase()
  if (!target || !STOPWORDS[target]) return false
  // English is the language the gap objectives are already written in, so an English document is
  // reachable through ordinary term overlap and needs no special path.
  if (target === 'en') return false
  return detectDominantLanguage(text) === target
}
