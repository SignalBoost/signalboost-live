// Compatibility layer for the retired fixed-source current-fact shortcut.
//
// COS current facts are now handled by the generic freshness pipeline:
//   requiresFreshExternalEvidence -> live search -> authority ranking -> grounded synthesis.
//
// This module intentionally contains NO preselected domains, URLs, office holders, countries,
// companies, or role-specific extractors. A source such as usa.gov may still be selected at runtime
// when live search returns it and the authority policy ranks it highly, but COS must not know that URL
// in advance.

export type FetchLike = (
  url: string,
  headers?: Record<string, string>,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export type AuthoritativeSource = {
  id: string
  label: string
  url: string
  extract: (body: string) => string | null
}

export type VolatileFactCategory = {
  id: string
  matches: (prompt: string) => boolean
  sources: AuthoritativeSource[]
}

export type GroundedFact = {
  answer: string
  categoryId: string
  sourceId: string
  sourceLabel: string
  sourceUrl: string
  fetchedAt: string
}

/**
 * Deliberately empty. Fixed fact categories caused source selection to be encoded in application
 * code (for example, one office-holder question being permanently coupled to one government URL).
 * Current facts now flow through the generic live-evidence policy instead.
 */
export const VOLATILE_FACT_CATEGORIES: VolatileFactCategory[] = []

export function classifyAuthoritativeVolatileFact(_prompt: string): VolatileFactCategory | null {
  return null
}

/**
 * Retained only for source compatibility while callers migrate away from the old direct-fact path.
 * With no fixed categories, this function can never perform network I/O or return a grounded value.
 */
export async function groundAuthoritativeVolatileFact(
  _prompt: string,
  _deps: { fetch: FetchLike; now?: () => number },
): Promise<GroundedFact | null> {
  return null
}

export function renderAuthoritativeGroundedReply(fact: GroundedFact): string {
  return `${fact.answer}\n\nSource: ${fact.sourceLabel} (${fact.sourceUrl}), retrieved ${fact.fetchedAt}.`
}
