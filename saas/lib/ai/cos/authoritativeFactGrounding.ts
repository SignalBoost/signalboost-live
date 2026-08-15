// Compatibility shim retained temporarily because cos-primary still imports these symbols.
// Topic-specific authoritative fact handlers are intentionally disabled. Generic evidence-first
// grounding now lives in cosEvidencePolicy + cosAuthoritativeResearch + cosEvidenceSynthesis.

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

export const VOLATILE_FACT_CATEGORIES: VolatileFactCategory[] = []

export function classifyAuthoritativeVolatileFact(_prompt: string): VolatileFactCategory | null {
  return null
}

export async function groundAuthoritativeVolatileFact(
  _prompt: string,
  _deps: { fetch: FetchLike; now?: () => number },
): Promise<GroundedFact | null> {
  return null
}

export function renderAuthoritativeGroundedReply(fact: GroundedFact): string {
  return `${fact.answer}\n\nSource: ${fact.sourceLabel} (${fact.sourceUrl}), retrieved ${fact.fetchedAt}.`
}
