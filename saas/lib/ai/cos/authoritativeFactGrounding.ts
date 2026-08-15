// Direct live-source grounding for narrow volatile facts that do not require model synthesis.
// A recognized fact is answered only from first-party/government sources.
// Multiple configured sources are queried concurrently: agreeing sources corroborate the answer,
// one healthy source can survive another source's outage, and conflicting authoritative answers
// fail closed. Callers must never substitute model memory for a recognized volatile fact.

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

export type GroundedSourceEvidence = {
  sourceId: string
  sourceLabel: string
  sourceUrl: string
  fetchedAt: string
}

export type GroundedFact = {
  answer: string
  categoryId: string
  sourceId: string
  sourceLabel: string
  sourceUrl: string
  fetchedAt: string
  sources: GroundedSourceEvidence[]
}

function pageText(body: string): string {
  return String(body || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCurrentUsPresidentQuestion(prompt: string): boolean {
  const p = String(prompt || '').trim()
  if (!p) return false
  const hasPresident = /\b(?:president|potus)\b/i.test(p)
  const hasUs = /\b(?:united states|u\.?s\.?|america)\b/i.test(p) || /\bpotus\b/i.test(p)
  if (!hasPresident || !hasUs) return false
  if (/\bwho\s+was\b|\bformer\b|\bprevious\b|\bin\s+(?:18|19|20)\d{2}\b/i.test(p)) return false
  return /\b(?:current|currently|today|now|at present)\b/i.test(p)
    || /\bwho\s+is\b/i.test(p)
    || /^\s*(?:the\s+)?(?:u\.?s\.?|united states)\s+president\s*\??\s*$/i.test(p)
    || /^\s*(?:current\s+)?potus\s*\??\s*$/i.test(p)
}

function canonicalPresidentAnswer(name: string): string | null {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ')
  if (!cleaned || cleaned.length > 80) return null
  return `The current President of the United States is ${cleaned}.`
}

function extractCurrentUsPresidentFromUsaGov(body: string): string | null {
  const text = pageText(body)
  const match = text.match(/current president of the United States is ([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-\s]{2,80}?)(?=[.,;])/i)
  return match ? canonicalPresidentAnswer(match[1]) : null
}

function extractCurrentUsPresidentFromWhiteHouse(body: string): string | null {
  const text = pageText(body)
  const match = text.match(/\bPresident\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-\s]{2,80}?)(?=\s+(?:\d{1,2}(?:st|nd|rd|th)\s*&\s*)?\d{1,2}(?:st|nd|rd|th)\s+President of the United States\b)/i)
  return match ? canonicalPresidentAnswer(match[1]) : null
}

function normalizedAnswer(answer: string): string {
  return String(answer || '')
    .toLowerCase()
    .replace(/[.’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const VOLATILE_FACT_CATEGORIES: VolatileFactCategory[] = [
  {
    id: 'us_president',
    matches: isCurrentUsPresidentQuestion,
    sources: [
      {
        id: 'whitehouse_administration',
        label: 'The White House — Administration',
        url: 'https://www.whitehouse.gov/administration/',
        extract: extractCurrentUsPresidentFromWhiteHouse,
      },
      {
        id: 'usagov_presidents',
        label: 'USAGov — Presidents, vice presidents, and first ladies',
        url: 'https://www.usa.gov/presidents',
        extract: extractCurrentUsPresidentFromUsaGov,
      },
    ],
  },
]

export function classifyAuthoritativeVolatileFact(prompt: string): VolatileFactCategory | null {
  return VOLATILE_FACT_CATEGORIES.find(category => category.matches(String(prompt || ''))) ?? null
}

export async function groundAuthoritativeVolatileFact(
  prompt: string,
  deps: { fetch: FetchLike; now?: () => number },
): Promise<GroundedFact | null> {
  const category = classifyAuthoritativeVolatileFact(prompt)
  if (!category) return null
  const now = deps.now ?? Date.now

  const attempts = await Promise.all(category.sources.map(async source => {
    try {
      const response = await deps.fetch(source.url, { accept: 'text/html,application/json' })
      if (!response.ok) return null
      const answer = source.extract(await response.text())
      if (!answer?.trim()) return null
      return {
        answer: answer.trim(),
        normalized: normalizedAnswer(answer),
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        fetchedAt: new Date(now()).toISOString(),
      }
    } catch {
      return null
    }
  }))

  const verified = attempts.filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (!verified.length) return null

  // If multiple authoritative sources answer, they must agree. A disagreement is safer to surface
  // as unavailable than to choose one source or ask a model to arbitrate from memory.
  const distinct = new Set(verified.map(item => item.normalized))
  if (distinct.size !== 1) return null

  const primary = verified[0]
  return {
    answer: primary.answer,
    categoryId: category.id,
    sourceId: primary.sourceId,
    sourceLabel: primary.sourceLabel,
    sourceUrl: primary.sourceUrl,
    fetchedAt: primary.fetchedAt,
    sources: verified.map(({ sourceId, sourceLabel, sourceUrl, fetchedAt }) => ({
      sourceId,
      sourceLabel,
      sourceUrl,
      fetchedAt,
    })),
  }
}

export function renderAuthoritativeGroundedReply(fact: GroundedFact): string {
  const citations = fact.sources.map(source =>
    `- ${source.sourceLabel} (${source.sourceUrl}), retrieved ${source.fetchedAt}.`,
  )
  return `${fact.answer}\n\nSource${citations.length === 1 ? '' : 's'}:\n${citations.join('\n')}`
}
