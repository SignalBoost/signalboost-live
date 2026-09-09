import type { LearningConnectorResult, LearningConnectorSearch } from './connectors.ts'

type FetchLike = typeof fetch

type SearchHit = {
  url: string
  title: string
  sourceDate?: string
  discoveryProvider?: 'brave' | 'duckduckgo_html' | 'duckduckgo_lite' | 'bing'
}

export type WebTrainingSourceClass =
  | 'standards_authority'
  | 'institutional'
  | 'scholarly'
  | 'owning_authority'
  | 'credible_secondary'
  | 'tertiary_reference'
  | 'low_signal'

export type WebTrainingSourceAssessment = Readonly<{
  sourceClass: WebTrainingSourceClass
  credibility: number
  host: string
  reason: string
}>

export type WebTrainingSearchOptions = Readonly<{
  fetcher?: FetchLike
  minCredibility?: number
  maxDiscoveryResults?: number
  braveApiKey?: string
  useBrave?: boolean
}>

const INSTITUTIONAL_HOST = /(?:^|\.)(?:gov|gob|gouv|mil|edu)(?:\.[a-z]{2,3})?$|(?:^|\.)(?:europa\.eu|ec\.europa\.eu|un\.org|who\.int|oecd\.org|worldbank\.org|imf\.org|ilo\.org|nhs\.uk|nih\.gov|cdc\.gov|fda\.gov|ema\.europa\.eu)$|(?:^|\.)ac\.[a-z]{2}$/i
const STANDARDS_HOST = /(?:^|\.)(?:ietf\.org|w3\.org|iso\.org|ieee\.org|nist\.gov)$/i
const SCHOLARLY_HOST = /(?:^|\.)(?:arxiv\.org|europepmc\.org|ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|acm\.org|nature\.com|science\.org|springer\.com|sciencedirect\.com)$/i
const LOW_SIGNAL_HOST = /(?:^|\.)(?:reddit\.com|quora\.com|medium\.com|substack\.com|blogspot\.com|wordpress\.com|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|pinterest\.com)$/i
const TERTIARY_HOST = /(?:^|\.)(?:wikipedia\.org|wikidata\.org|stackoverflow\.com|stackexchange\.com)$/i
const CODE_FORGE_HOST = /(?:^|\.)(?:github\.com|gitlab\.com|codeberg\.org)$/i
const GENERIC_TERMS = new Set([
  'about', 'after', 'architecture', 'business', 'current', 'data', 'documentation', 'engineering',
  'evidence', 'from', 'general', 'latest', 'official', 'primary', 'research', 'software', 'source',
  'standard', 'standards', 'system', 'systems', 'technology', 'training', 'university', 'using',
  'what', 'when', 'where', 'which', 'with',
])
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RAW_PAGE_CHARS = 300_000
const MAX_RETAINED_PAGE_CHARS = 30_000
const MIN_READABLE_PAGE_CHARS = 700
const SEARCH_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

function stripHtml(value: string): string {
  return decodeEntities(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<\/?(?:article|section|main|li|p|h[1-6]|br|tr|div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/^\[|\]$/g, '')
  } catch {
    return ''
  }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isPrivateIpv6(host: string): boolean {
  const value = host.toLowerCase()
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')
}

export function isSafePublicWebTrainingUrl(value: string): boolean {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.username || url.password) return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host.endsWith('.internal') || host.endsWith('.onion')) return false
    return !isPrivateIpv4(host) && !isPrivateIpv6(host)
  } catch {
    return false
  }
}

function significantTerms(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of String(value || '').toLowerCase().split(/[^a-z0-9-]+/)) {
    const term = raw.replace(/^-+|-+$/g, '').trim()
    if (term.length < 3 || term.length > 40 || GENERIC_TERMS.has(term) || /^\d+$/.test(term) || seen.has(term)) continue
    seen.add(term)
    out.push(term)
  }
  return out.slice(0, 24)
}

function authorityTokensFromUrl(value: string): Set<string> {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const ignored = new Set(['com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'dev', 'app', 'co'])
    const tokens = new Set(host.split('.').filter(part => part.length >= 3 && !ignored.has(part)))
    if (CODE_FORGE_HOST.test(host)) {
      for (const part of url.pathname.split('/').filter(Boolean).slice(0, 2)) {
        const normalized = part.toLowerCase().replace(/[^a-z0-9-]/g, '')
        if (normalized.length >= 3) tokens.add(normalized)
      }
    }
    return tokens
  } catch {
    return new Set()
  }
}

export function assessWebTrainingSource(url: string, query: string): WebTrainingSourceAssessment {
  const host = hostOf(url)
  if (!isSafePublicWebTrainingUrl(url) || !host) return { sourceClass: 'low_signal', credibility: 0, host, reason: 'unsafe_or_non_public_url' }
  if (LOW_SIGNAL_HOST.test(host)) return { sourceClass: 'low_signal', credibility: 0.2, host, reason: 'community_or_self_publishing_platform' }
  if (STANDARDS_HOST.test(host)) return { sourceClass: 'standards_authority', credibility: 0.99, host, reason: 'standards_or_public_control_authority' }
  if (INSTITUTIONAL_HOST.test(host)) return { sourceClass: 'institutional', credibility: 0.97, host, reason: 'government_academic_or_intergovernmental_domain' }
  if (SCHOLARLY_HOST.test(host)) return { sourceClass: 'scholarly', credibility: 0.95, host, reason: 'scholarly_publisher_or_research_repository' }
  const ownerMatch = significantTerms(query).some(term => authorityTokensFromUrl(url).has(term))
  if (ownerMatch) return { sourceClass: 'owning_authority', credibility: 0.92, host, reason: 'query_entity_matches_source_domain_or_repository_owner' }
  if (TERTIARY_HOST.test(host)) return { sourceClass: 'tertiary_reference', credibility: 0.66, host, reason: 'tertiary_or_community_reference' }
  return { sourceClass: 'credible_secondary', credibility: 0.7, host, reason: 'public_web_without_structural_primary_authority_signal' }
}

export function webTrainingMinimumCredibility(value: unknown = process.env.COS_WEB_TRAINING_MIN_CREDIBILITY): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0.7, Math.min(0.99, parsed)) : 0.82
}

export function buildWebTrainingResearchQuery(query: string): string {
  const words = [...clean(query).split(' ').filter(Boolean).slice(0, 20),
    'authoritative', 'primary', 'source', 'official', 'documentation', 'university', 'research', 'standard']
  const seen = new Set<string>()
  return words.filter(word => {
    const key = word.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(' ').slice(0, 380).replace(/\s+\S*$/, match => words.join(' ').length > 380 ? '' : match).trim()
}

async function requestText(fetcher: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<{ text: string; contentType: string }> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal, cache: 'no-store' })
      if (!response.ok) {
        const error = new Error(`web training source failed: ${response.status}`)
        if (!TRANSIENT_STATUS.has(response.status)) throw error
        lastError = error
        continue
      }
      const contentLength = Number(response.headers.get('content-length') || 0)
      if (contentLength > 2_500_000) throw new Error('web training source too large')
      return { text: await response.text(), contentType: response.headers.get('content-type') || '' }
    } catch (error) {
      lastError = error
      if (attempt >= 1) throw error
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('web training source failed')
}

function decodeDuckHref(href: string): string {
  try {
    const url = new URL(decodeEntities(href), 'https://html.duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ? decodeURIComponent(target) : url.toString()
  } catch {
    return decodeEntities(href)
  }
}

function pushUniqueHit(found: SearchHit[], seen: Set<string>, url: string, title: string, count: number, discoveryProvider: SearchHit['discoveryProvider']): void {
  const normalizedUrl = decodeEntities(url).trim()
  if (found.length >= count || !isSafePublicWebTrainingUrl(normalizedUrl) || seen.has(normalizedUrl)) return
  seen.add(normalizedUrl)
  found.push({ url: normalizedUrl, title: stripHtml(title).slice(0, 220) || normalizedUrl, discoveryProvider })
}

async function discoverDuckDuckGo(fetcher: FetchLike, query: string, count: number): Promise<SearchHit[]> {
  const { text: html } = await requestText(fetcher,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.8', 'user-agent': SEARCH_BROWSER_UA } }, 10_000)
  const found: SearchHit[] = []
  const seen = new Set<string>()
  const linkRe = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) && found.length < count) {
    pushUniqueHit(found, seen, decodeDuckHref(match[1]), match[2], count, 'duckduckgo_html')
  }
  return found
}

async function discoverDuckDuckGoLite(fetcher: FetchLike, query: string, count: number): Promise<SearchHit[]> {
  const { text: html } = await requestText(fetcher,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
    { headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.8', 'user-agent': SEARCH_BROWSER_UA } }, 10_000)
  const found: SearchHit[] = []
  const seen = new Set<string>()
  const linkRe = /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) && found.length < count) {
    pushUniqueHit(found, seen, decodeDuckHref(match[1]), match[2], count, 'duckduckgo_lite')
  }
  return found
}

async function discoverBing(fetcher: FetchLike, query: string, count: number): Promise<SearchHit[]> {
  const { text: html } = await requestText(fetcher,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(20, Math.max(8, count * 2))}&mkt=en-US`,
    { headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.8', 'user-agent': SEARCH_BROWSER_UA } }, 10_000)
  const found: SearchHit[] = []
  const seen = new Set<string>()
  const rowRe = /<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) && found.length < count) {
    const anchor = rowMatch[1].match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i)
    if (!anchor) continue
    pushUniqueHit(found, seen, anchor[1], anchor[2], count, 'bing')
  }
  return found
}

async function discoverProviderFree(fetcher: FetchLike, query: string, count: number): Promise<SearchHit[]> {
  const providers = [discoverDuckDuckGo, discoverDuckDuckGoLite, discoverBing] as const
  let lastError: unknown
  for (const provider of providers) {
    try {
      const hits = await provider(fetcher, query, count)
      if (hits.length) return hits
    } catch (error) {
      lastError = error
    }
  }
  if (lastError instanceof Error) throw lastError
  if (lastError) throw new Error(String(lastError))
  return []
}

async function discoverBrave(fetcher: FetchLike, query: string, count: number, apiKey: string): Promise<SearchHit[]> {
  const { text } = await requestText(fetcher,
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(12, count)}`,
    { headers: { accept: 'application/json', 'x-subscription-token': apiKey } }, 10_000)
  const json = JSON.parse(text)
  const raw = Array.isArray(json?.web?.results) ? json.web.results : []
  return raw.slice(0, count).map((row: any): SearchHit => ({
    url: clean(row?.url), title: clean(row?.title).slice(0, 220), sourceDate: clean(row?.age).slice(0, 100) || undefined,
    discoveryProvider: 'brave',
  })).filter((row: SearchHit) => isSafePublicWebTrainingUrl(row.url))
}

async function readTrainingPage(fetcher: FetchLike, hit: SearchHit): Promise<string> {
  const { text: raw, contentType } = await requestText(fetcher, hit.url,
    { headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,application/xml;q=0.7', 'user-agent': 'iTMounts-COS/1.0' } }, 12_000)
  if (contentType && !/(?:text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)/i.test(contentType)) return ''
  const text = stripHtml(raw.slice(0, MAX_RAW_PAGE_CHARS))
  if (/\b(?:access denied|temporarily unavailable|technical difficulties|enable javascript to continue)\b/i.test(text.slice(0, 1500))) return ''
  return text.length >= MIN_READABLE_PAGE_CHARS ? text.slice(0, MAX_RETAINED_PAGE_CHARS) : ''
}

export function createWebTrainingResearchSearch(options: WebTrainingSearchOptions = {}): LearningConnectorSearch {
  const fetcher = options.fetcher ?? fetch
  const minCredibility = Number.isFinite(options.minCredibility)
    ? Math.max(0.7, Math.min(0.99, Number(options.minCredibility))) : webTrainingMinimumCredibility()
  const discoveryLimit = Number.isFinite(options.maxDiscoveryResults)
    ? Math.max(3, Math.min(12, Math.floor(Number(options.maxDiscoveryResults)))) : 8
  const braveKey = clean(options.braveApiKey)
  const useBrave = options.useBrave === true && Boolean(braveKey)

  return async (query, limit): Promise<LearningConnectorResult[]> => {
    const plannedQuery = buildWebTrainingResearchQuery(query)
    if (!plannedQuery) return []
    let hits: SearchHit[] = []
    if (useBrave) {
      try { hits = await discoverBrave(fetcher, plannedQuery, discoveryLimit, braveKey) } catch { hits = [] }
    }
    if (!hits.length) hits = await discoverProviderFree(fetcher, plannedQuery, discoveryLimit)

    const ranked = hits
      .map((hit, index) => ({ hit, index, assessment: assessWebTrainingSource(hit.url, query) }))
      .filter(entry => entry.assessment.credibility >= minCredibility)
      .sort((a, b) => b.assessment.credibility - a.assessment.credibility
        || Number(Boolean(b.hit.sourceDate)) - Number(Boolean(a.hit.sourceDate)) || a.index - b.index)

    const diverse: typeof ranked = []
    const hosts = new Set<string>()
    for (const entry of ranked) {
      if (hosts.has(entry.assessment.host)) continue
      hosts.add(entry.assessment.host)
      diverse.push(entry)
      if (diverse.length >= Math.min(Math.max(1, limit), 5)) break
    }

    const pages: Array<LearningConnectorResult | null> = await Promise.all(diverse.map(async entry => {
      try {
        const text = await readTrainingPage(fetcher, entry.hit)
        if (!text) return null
        const credibility = entry.assessment.credibility.toFixed(2)
        return {
          uri: entry.hit.url,
          title: entry.hit.title || entry.assessment.host,
          text,
          observedAt: new Date().toISOString(),
          license: `facts_and_summary_only; web_data_layer=credible_training_research_v1; source_class=${entry.assessment.sourceClass}; credibility=${credibility}`,
          evidence: [
            'web_data_layer=credible_training_research_v1',
            `source_class=${entry.assessment.sourceClass}`,
            `source_credibility=${credibility}`,
            `source_host=${entry.assessment.host}`,
            ...(entry.hit.discoveryProvider ? [`discovery_provider=${entry.hit.discoveryProvider}`] : []),
            ...(entry.hit.sourceDate ? [`source_date=${entry.hit.sourceDate}`] : []),
          ],
        }
      } catch {
        return null
      }
    }))

    return pages.flatMap(row => row ? [row] : [])
  }
}