// Claim-directed research for live/current questions. Retrieval finds candidates; this module
// decides when those candidates must be read before evidence is judged or synthesized.

import type { FreshEvidenceSource } from './cosFreshGrounding.ts'

type Page = { url: string; snippet: string }
type PageReader = (urls: string[]) => Promise<Page[]>

export type ClaimResearchStatus = 'grounded' | 'needs_deeper_read' | 'insufficient'
export type ClaimResearchClaim = { text: string; status: ClaimResearchStatus }
export type ClaimResearchResult = {
  sources: FreshEvidenceSource[]
  claims: ClaimResearchClaim[]
  pagesRead: number
}

function words(value: string): string[] {
  return [...new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])]
}

export function splitResearchClaims(input: string): string[] {
  const parts = String(input || '').split(/\s*(?:\?|;|\b(?:and|also|plus|then)\b)\s*/i)
    .map(part => part.trim()).filter(part => words(part).length >= 2)
  return parts.length ? parts : [String(input || '').trim()].filter(Boolean)
}

function sameUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left), b = new URL(right)
    return a.hostname === b.hostname && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '')
  } catch { return left === right }
}

function thin(source: FreshEvidenceSource): boolean {
  const text = String(source.snippet || '').trim()
  // A search result can identify an excellent document without containing its facts. Treat the
  // document as unread; never confuse its title/URL with evidence of its contents.
  return text.length < 1400 || /\b(?:list|history|biograph|profile|report|statistics|results|official)\b/i.test(source.title)
}

function statusFor(claim: string, sources: FreshEvidenceSource[], pagesRead: number): ClaimResearchStatus {
  const terms = words(claim).filter(term => !['current', 'past', 'last', 'years', 'give', 'list', 'what', 'who'].includes(term))
  const supported = sources.some(source => terms.some(term => `${source.title}\n${source.snippet}`.toLowerCase().includes(term)))
  if (supported && pagesRead > 0) return 'grounded'
  return sources.length ? 'needs_deeper_read' : 'insufficient'
}

export async function deepenClaimResearch(input: string, sources: FreshEvidenceSource[], readPages: PageReader): Promise<ClaimResearchResult> {
  const claims = splitResearchClaims(input)
  const candidates = sources.filter(thin).slice(0, 4)
  if (!candidates.length) return { sources, claims: claims.map(text => ({ text, status: statusFor(text, sources, 0) })), pagesRead: 0 }

  const settled = await Promise.allSettled(candidates.map(source => readPages([source.url])))
  const bodies = new Map<string, string>()
  for (let index = 0; index < candidates.length; index += 1) {
    const result = settled[index]
    const pages = result.status === 'fulfilled' ? result.value : []
    const page = pages.find(item => sameUrl(item.url, candidates[index].url)) ?? pages[0]
    if (page?.snippet) bodies.set(candidates[index].url, page.snippet.slice(0, 24_000))
  }
  const deepened = sources.map(source => bodies.has(source.url) ? { ...source, snippet: bodies.get(source.url)! } : source)
  const pagesRead = bodies.size
  return { sources: deepened, claims: claims.map(text => ({ text, status: statusFor(text, deepened, pagesRead) })), pagesRead }
}

export function claimResearchPrompt(claims: ClaimResearchClaim[]): string {
  return claims.map((claim, index) => `${index + 1}. ${claim.text} — ${claim.status}`).join('\n')
}
