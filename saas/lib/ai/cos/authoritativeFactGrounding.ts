// Direct live-source grounding for narrow volatile facts that do not require model synthesis.
// A recognized fact is answered only when a first-party/government source yields the value.
// Source failure returns null; callers must fail closed rather than substitute model memory.

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

function extractCurrentUsPresident(body: string): string | null {
  const text = pageText(body)
  const match = text.match(/current president of the United States is ([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-\s]{2,80}?)(?=[.,;])/i)
  if (!match) return null
  const name = match[1].trim().replace(/\s+/g, ' ')
  if (!name || name.length > 80) return null
  return `The current President of the United States is ${name}.`
}

export const VOLATILE_FACT_CATEGORIES: VolatileFactCategory[] = [
  {
    id: 'us_president',
    matches: isCurrentUsPresidentQuestion,
    sources: [
      {
        id: 'usagov_presidents',
        label: 'USAGov — Presidents, vice presidents, and first ladies',
        url: 'https://www.usa.gov/presidents',
        extract: extractCurrentUsPresident,
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

  for (const source of category.sources) {
    try {
      const response = await deps.fetch(source.url, { accept: 'text/html,application/json' })
      if (!response.ok) continue
      const answer = source.extract(await response.text())
      if (!answer?.trim()) continue
      return {
        answer: answer.trim(),
        categoryId: category.id,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        fetchedAt: new Date(now()).toISOString(),
      }
    } catch {
      continue
    }
  }
  return null
}

export function renderAuthoritativeGroundedReply(fact: GroundedFact): string {
  return `${fact.answer}\n\nSource: ${fact.sourceLabel} (${fact.sourceUrl}), retrieved ${fact.fetchedAt}.`
}
