// saas/lib/ai/cos/authoritativeFactGrounding.ts
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

// USAGov restructured /presidents in 2026 to render the name dynamically, so its static HTML no
// longer contains the president's name — exactly how a single hardcoded source silently rots and
// serves stale/empty answers. The category therefore carries MULTIPLE independent authoritative
// sources; grounding walks them in order and the first that still yields a name wins, so one page
// changing shape can never again produce a stale answer. Extractors are matched to each source's
// ACTUAL current page text, not a phrasing we wish it used.
function extractPresidentFromWikipedia(body: string): string | null {
  const text = pageText(body)
  // Verified against live page text. Two shapes Wikipedia uses:
  //  forward: "Donald Trump is the 47th and current president"
  //  reverse: "current president of the United States is Donald John Trump"
  const forward = text.match(/([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]+){1,3})\s+is the\s+[0-9A-Za-z]+\s+and current president/)
  const reverse = text.match(/current president of the United States is\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-\s]{2,60}?)(?=[.,;])/i)
  const raw = (forward?.[1] || reverse?.[1] || '').trim().replace(/\s+/g, ' ')
  return raw && raw.length <= 60 ? `The current President of the United States is ${raw}.` : null
}

function extractPresidentFromWhiteHouse(body: string): string | null {
  const text = pageText(body)
  const m = text.match(/President\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]+){1,3})/)
  if (!m) return null
  const name = m[1].trim().replace(/\s+/g, ' ')
  return name && name.length <= 60 ? `The current President of the United States is ${name}.` : null
}

export const VOLATILE_FACT_CATEGORIES: VolatileFactCategory[] = [
  {
    id: 'us_president',
    matches: isCurrentUsPresidentQuestion,
    // Ordered by structural stability for this fact: Wikipedia names the incumbent in stable prose,
    // whitehouse.gov names the sitting president, USAGov kept last as a legacy check.
    sources: [
      {
        id: 'wikipedia_potus',
        label: 'Wikipedia — List of presidents of the United States',
        url: 'https://simple.wikipedia.org/wiki/List_of_presidents_of_the_United_States',
        extract: extractPresidentFromWikipedia,
      },
      {
        id: 'whitehouse_administration',
        label: 'The White House — Administration',
        url: 'https://www.whitehouse.gov/administration/',
        extract: extractPresidentFromWhiteHouse,
      },
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
