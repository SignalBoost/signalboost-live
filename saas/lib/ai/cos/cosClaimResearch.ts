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
export type DatedRoster = { reply: string; sources: FreshEvidenceSource[] } | null

function requestedWindowStart(input: string, now = new Date()): number | null {
  const match = String(input || '').match(/\b(?:past|last)\s+(\d{1,3})\s+years?\b/i)
  return match ? now.getUTCFullYear() - Number(match[1]) : null
}

function archiveEndsBefore(source: FreshEvidenceSource, startYear: number, now = new Date()): boolean {
  const requiredLatestYear = now.getUTCFullYear() - 1
  const urlWindow = source.url.match(/(?:^|[./-])(\d{4})[-_](\d{4})(?:[./-]|$)/)
  if (urlWindow && Number(urlWindow[2]) < requiredLatestYear) return true
  const ranges = [...String(source.snippet || '').matchAll(/\b(\d{4})\s*[–-]\s*(\d{4})?\b/g)]
    .map(match => Number(match[2] || match[1])).filter(Number.isFinite)
  return ranges.length >= 2 && Math.max(...ranges) < requiredLatestYear
}

/** Remove documents that cannot cover the user-requested time window. This is scope binding,
 * not topic-specific filtering: a dated archive may be authoritative about its own period but
 * cannot prove a present or last-N-years claim outside that period. */
export function bindSourcesToRequestedWindow(input: string, sources: FreshEvidenceSource[], now = new Date()): FreshEvidenceSource[] {
  const startYear = requestedWindowStart(input, now)
  if (startYear === null) return sources
  return sources.filter(source => !archiveEndsBefore(source, startYear, now))
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

function scoreSourceForClaim(claim: string, source: FreshEvidenceSource): number {
  const haystack = `${source.title} ${source.url}`.toLowerCase()
  const claimWords = words(claim)
  let score = claimWords.reduce((total, word) => total + (haystack.includes(word) ? 12 : 0), 0)
  const host = (() => { try { return new URL(source.url).hostname } catch { return '' } })()
  if (host.endsWith('.gov')) score += 100
  if (/\b(?:past|former|previous|history|last)\b/i.test(claim) && /\b(?:former|history|list|biograph|archive)\b/i.test(haystack)) score += 80
  if (/\b(?:current|today|now)\b/i.test(claim) && /\b(?:official|secretary|leadership|administration|profile)\b/i.test(haystack)) score += 45
  const startYear = requestedWindowStart(claim)
  if (startYear !== null && archiveEndsBefore(source, startYear)) score -= 1000
  return score
}

function hasDatedRoster(source: FreshEvidenceSource): boolean {
  return (String(source.snippet || '').match(/\b\d{4}\s*[–-]\s*(?:\d{4})?\b/g) || []).length >= 2
}

function statusFor(claim: string, sources: FreshEvidenceSource[], pagesRead: number): ClaimResearchStatus {
  const terms = words(claim).filter(term => !['current', 'past', 'last', 'years', 'give', 'list', 'what', 'who'].includes(term))
  const supported = sources.some(source => terms.some(term => `${source.title}\n${source.snippet}`.toLowerCase().includes(term)))
  if (/\b(?:past|former|previous|history|last)\b/i.test(claim)) {
    return sources.some(hasDatedRoster) ? 'grounded' : (pagesRead ? 'insufficient' : 'needs_deeper_read')
  }
  if (supported && pagesRead > 0) return 'grounded'
  return sources.length ? 'needs_deeper_read' : 'insufficient'
}

export async function deepenClaimResearch(input: string, sources: FreshEvidenceSource[], readPages: PageReader): Promise<ClaimResearchResult> {
  const claims = splitResearchClaims(input)
  // Each claim gets a chance to nominate its best authority/document. Selecting only the first
  // search results lets a current-profile page crowd out the historical table or report needed by
  // a later claim in the same user request.
  const candidates = [...new Map(claims.flatMap(claim => sources
    .filter(thin)
    .sort((left, right) => scoreSourceForClaim(claim, right) - scoreSourceForClaim(claim, left))
    .slice(0, 2)
    .map(source => [source.url, source] as const))).values()].slice(0, 4)
  if (!candidates.length) return { sources, claims: claims.map(text => ({ text, status: statusFor(text, sources, 0) })), pagesRead: 0 }

  const settled = await Promise.allSettled(candidates.map(source => readPages([source.url])))
  const bodies = new Map<string, string>()
  for (let index = 0; index < candidates.length; index += 1) {
    const result = settled[index]
    const pages = result.status === 'fulfilled' ? result.value : []
    const page = pages.find(item => sameUrl(item.url, candidates[index].url)) ?? pages[0]
    if (page?.snippet) bodies.set(candidates[index].url, page.snippet.slice(0, 24_000))
  }
  const deepened = bindSourcesToRequestedWindow(input, sources.map(source => bodies.has(source.url) ? { ...source, snippet: bodies.get(source.url)! } : source))
  const pagesRead = bodies.size
  return { sources: deepened, claims: claims.map(text => ({ text, status: statusFor(text, deepened, pagesRead) })), pagesRead }
}

export function claimResearchPrompt(claims: ClaimResearchClaim[]): string {
  return claims.map((claim, index) => `${index + 1}. ${claim.text} — ${claim.status}`).join('\n')
}

/** Build a bounded answer from dated rows already read from selected sources. */
export function constructDatedRoster(input: string, sources: FreshEvidenceSource[], now = new Date()): DatedRoster {
  const start = requestedWindowStart(input, now)
  if (start === null) return null
  const rows: Array<{ name: string; start: number; end: number | null; source: FreshEvidenceSource }> = []
  // Public historical pages commonly put the name and tenure on adjacent lines. Accept both
  // that layout and compact same-line tables; page chrome still cannot become a row without dates.
  for (const source of sources) for (const match of String(source.snippet || '').matchAll(/(?:^|\n)\s*(?:\d+[.)]\s*)?([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,5})[ \t]*(?:\r?\n[ \t]*)?\(?\s*(\d{4})\s*[–-]\s*(\d{4})?\s*\)?/gm)) {
    const end = match[3] ? Number(match[3]) : null
    if ((end ?? now.getUTCFullYear()) >= start) rows.push({ name: match[1].trim(), start: Number(match[2]), end, source })
  }
  const unique = rows.filter((row, index, all) => all.findIndex(other => other.name === row.name && other.start === row.start) === index).sort((a, b) => a.start - b.start)
  if (unique.length < 2) return null
  const list = unique.map(row => `- ${row.name} — ${row.start}${row.end ? `–${row.end}` : '–present'}`).join('\n')
  const used = [...new Map(unique.map(row => [row.source.url, row.source] as const)).values()]
  return { reply: `Verified dated entries for the requested period:\n${list}`, sources: used }
}
