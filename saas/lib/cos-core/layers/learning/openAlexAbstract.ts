// saas/lib/cos-core/layers/learning/openAlexAbstract.ts
/**
 * OpenAlex returns an abstract with every work, but as an inverted index — a map of word to the
 * positions it occupies — rather than as text. The client ignored it and sent title, primary topic,
 * keywords and a citation count instead, which is a bibliographic stub of roughly twenty words.
 * That is exactly the shape that clears relevance and then fails the confidence floor: in one
 * production day Computer Science rejected 58% of its documents as below confidence while accepting
 * one out of 1,389.
 *
 * Reconstructing the abstract costs no extra request and adds no source: it is the same response,
 * read properly. OpenAlex abstracts are CC0, so the licensing surface is unchanged.
 */

/** Longest abstract to rebuild. Beyond this the source is not the reason a gap is unmet. */
const MAX_ABSTRACT_WORDS = 4000

export function abstractFromInvertedIndex(index: unknown): string {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return ''
  const slots: string[] = []
  let highest = -1
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) {
      const at = Number(position)
      if (!Number.isInteger(at) || at < 0 || at >= MAX_ABSTRACT_WORDS) continue
      slots[at] = word
      if (at > highest) highest = at
    }
  }
  if (highest < 0) return ''
  const words: string[] = []
  for (let at = 0; at <= highest; at += 1) {
    const word = slots[at]
    if (word) words.push(word)
  }
  return words.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Abstracts shorter than this are stubs — a single sentence of boilerplate — and are treated as
 * metadata so the licence label stays honest about what the evidence actually is.
 */
export const SUBSTANTIVE_ABSTRACT_CHARS = 300

export function openAlexAbstractIsSubstantive(abstract: string): boolean {
  return abstract.trim().length >= SUBSTANTIVE_ABSTRACT_CHARS
}
