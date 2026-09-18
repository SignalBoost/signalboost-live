// saas/lib/cos-core/layers/learning/learningSourceCaps.ts
/**
 * How many results each learning source may contribute per gap, per cycle.
 *
 * Measured over six production hours: `official_docs` alone produced 377 not-relevant rejections and
 * `open_library` 58, while crossref, openalex and europe_pmc retrieved six documents each. The feeds
 * return whatever the feed holds regardless of the query, so they filled their quota on every tick,
 * while the query-targeted sources that can return substantive text were the smallest part of the
 * pool. In the same window every floor rejection scored 0.55 against a required 0.60 — the evidence
 * was close, not hopeless, which is what makes the mix worth correcting.
 *
 * These caps decide only which candidates are offered. Every relevance, confidence and source floor
 * is untouched: the same gates judge a better-composed set.
 *
 * europe_pmc is deliberately lower than its scholarly peers because each result may trigger a
 * full-text XML fetch, so its cost per result is several times the others'.
 */
export const DEFAULT_LEARNING_SOURCE_CAPS = {
  crossref: 6,
  openalex: 6,
  europe_pmc: 4,
  open_library: 1,
  gdelt: 2,
  official_docs: 1,
  reference: 3,
} as const

/**
 * Resolves one cap from its environment override. Anything unusable falls back to the measured
 * default, and the ceiling matches the page size these APIs accept, so a mistyped variable can
 * never widen a source beyond what its endpoint will serve.
 */
export function learningSourceCap(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(10, parsed)
}
