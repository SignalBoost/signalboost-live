import { getExternalInfo, type SearchResult } from '@/lib/ai/tools/getExternalInfo'
import type { CosEvidencePolicy } from '@/lib/ai/cos/cosEvidencePolicy'

export type AuthorityTier = 'primary' | 'institutional' | 'secondary'

export type AuthoritativeEvidenceSource = SearchResult & {
  id: string
  authorityTier: AuthorityTier
  authorityScore: number
  host: string
}

export type AuthoritativeResearchResult = {
  ok: boolean
  query: string
  retrievedAt: string
  sources: AuthoritativeEvidenceSource[]
  sufficient: boolean
  minimumCitations: number
  error: string | null
}

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','on','for','with','from','is','are','was','were','who','what','when','where','which','how','does','did','has','have','current','currently','latest','today','now','please','tell','me','about',
])

function hostFromUrl(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function normalizedUrl(value: string): string | null {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.hash = ''
    return url.toString()
  } catch { return null }
}

function tokens(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token))
}

function isGovernmentHost(host: string): boolean {
  return host.endsWith('.gov') || host.includes('.gov.') || host === 'gov.uk' || host.endsWith('.gov.uk') || host.endsWith('.gouv.fr') || host.endsWith('.gov.pl') || host.endsWith('.gov.br') || host.endsWith('.europa.eu')
}

function isMilitaryHost(host: string): boolean {
  return host.endsWith('.mil') || host.includes('.mil.')
}

function docsSignal(result: SearchResult, host: string): boolean {
  const url = String(result.url || '').toLowerCase()
  const title = String(result.title || '')
  return /^(?:docs|developer|developers|support|help|learn|documentation)\./.test(host)
    || /\/(?:docs|documentation|reference|api|releases?|release-notes|standards?)\b/.test(url)
    || /\b(?:official|documentation|docs|api reference|reference|release notes|standard|specification)\b/i.test(title)
}

function hostQueryOverlap(host: string, query: string): number {
  const hostTokens = new Set(tokens(host.replace(/\.(?:com|org|net|io|dev|co|gov|edu|mil|uk|eu)$/i, ' ')))
  let overlap = 0
  for (const token of new Set(tokens(query))) if (hostTokens.has(token)) overlap += 1
  return overlap
}

function titleQueryOverlap(title: string, query: string): number {
  const titleTokens = new Set(tokens(title))
  let overlap = 0
  for (const token of new Set(tokens(query))) if (titleTokens.has(token)) overlap += 1
  return overlap
}

export function authorityScore(query: string, result: SearchResult): number {
  const host = hostFromUrl(result.url)
  if (!host) return 0
  let score = 0
  if (isGovernmentHost(host)) score += 120
  if (isMilitaryHost(host)) score += 115
  if (host.endsWith('.edu') || host.includes('.edu.')) score += 35
  const hostOverlap = hostQueryOverlap(host, query)
  const titleOverlap = titleQueryOverlap(result.title, query)
  score += Math.min(60, hostOverlap * 30)
  score += Math.min(30, titleOverlap * 10)
  if (docsSignal(result, host)) score += 35
  if (/\bofficial\b/i.test(result.title)) score += 20
  if (host.endsWith('.org')) score += 8
  if (String(result.url || '').startsWith('https://')) score += 2
  return score
}

export function authorityTier(query: string, result: SearchResult): AuthorityTier {
  const host = hostFromUrl(result.url)
  const score = authorityScore(query, result)
  if (isGovernmentHost(host) || isMilitaryHost(host)) return 'primary'
  if (score >= 70) return 'primary'
  if (score >= 30) return 'institutional'
  return 'secondary'
}

export function authoritativeSearchQuery(input: string, policy: CosEvidencePolicy, now = new Date()): string {
  const base = String(input || '').trim()
  if (policy.freshnessRequired) {
    // Keep this byte-for-byte aligned with cosFreshGrounding.freshEvidenceSearchQuery so the
    // route's existing five-minute search cache is reused rather than issuing a second web query.
    return `${base} official authoritative source current as of ${now.toISOString().slice(0, 10)}`.slice(0, 400)
  }
  return `${base} official primary authoritative source documentation`.slice(0, 400)
}

export function prepareAuthoritativeEvidence(
  input: string,
  results: SearchResult[],
  limit = 8,
): AuthoritativeEvidenceSource[] {
  const seen = new Set<string>()
  const ranked: Array<{ result: SearchResult; index: number; score: number; tier: AuthorityTier; host: string }> = []

  results.forEach((raw, index) => {
    const url = normalizedUrl(raw.url)
    if (!url) return
    const key = url.toLowerCase().replace(/\/$/, '')
    if (seen.has(key)) return
    seen.add(key)
    const result: SearchResult = {
      title: String(raw.title || '').trim().slice(0, 200),
      url,
      snippet: String(raw.snippet || '').trim().slice(0, 500),
    }
    const host = hostFromUrl(url)
    const score = authorityScore(input, result)
    ranked.push({ result, index, score, tier: authorityTier(input, result), host })
  })

  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.slice(0, Math.max(1, Math.min(limit, 12))).map((entry, index) => ({
    ...entry.result,
    id: `AUTH${index + 1}`,
    authorityTier: entry.tier,
    authorityScore: entry.score,
    host: entry.host,
  }))
}

export function authoritativeEvidenceIsSufficient(policy: CosEvidencePolicy, sources: AuthoritativeEvidenceSource[]): boolean {
  if (!sources.length) return false
  if (policy.mode === 'preferred') return true

  const primary = sources.filter(source => source.authorityTier === 'primary').length
  const institutional = sources.filter(source => source.authorityTier === 'institutional').length

  // Volatile facts require at least one primary source or two independent institutional sources.
  // Stable factual lookups still require evidence better than an arbitrary single web result.
  if (policy.freshnessRequired) return primary >= 1 || institutional >= 2
  return primary >= 1 || institutional >= 1 || sources.length >= 2
}

export async function researchAuthoritativeEvidence(
  input: string,
  policy: CosEvidencePolicy,
  now = new Date(),
): Promise<AuthoritativeResearchResult> {
  const query = authoritativeSearchQuery(input, policy, now)
  const retrievedAt = now.toISOString()
  const live = await getExternalInfo(query, 10)
  if (!live.ok) {
    return { ok: false, query, retrievedAt, sources: [], sufficient: false, minimumCitations: 0, error: live.error || 'Authoritative search failed.' }
  }

  const sources = prepareAuthoritativeEvidence(input, live.results, 8)
  const sufficient = authoritativeEvidenceIsSufficient(policy, sources)
  const credibleCount = sources.filter(source => source.authorityTier !== 'secondary').length
  const minimumCitations = credibleCount >= 2 ? 2 : sources.length ? 1 : 0
  return {
    ok: sources.length > 0,
    query,
    retrievedAt,
    sources,
    sufficient,
    minimumCitations,
    error: sufficient ? null : 'Search returned results, but not enough authoritative evidence for this request.',
  }
}
