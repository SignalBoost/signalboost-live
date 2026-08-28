// saas/lib/ai/tools/getExternalInfo.ts
// Live web search for the Chief of Staff.
// Returns structured top results (title, url, snippet) for market/competitor/news queries.
//
// PORTABLE: search providers are injected. Ordinary web retrieval uses WebSearchPort;
// high-frequency public values (weather/financial/sports) use StructuredLiveDataPort so
// COS never mistakes an ordinary web snippet for a real-time feed.

import { structuredLiveDataKind } from '@/lib/ai/cos/cosFreshnessPolicy'
import {
  augmentQueryForOfficialSources,
  classifyAuthoritativeSourceNeed,
  officialCoverageNote,
  rankByAuthority,
  type AuthorityTier,
} from '@/lib/ai/cos/officialSourceAuthority'
import { getStructuredLiveInfo } from '@/lib/ai/tools/getStructuredLiveInfo'
import { searchPublicWeb } from '@/lib/ai/tools/publicWebAgent'
import { hostBrandName } from '@/lib/portable/companyIdentity'
import { buildCosChatIntelligence } from '@/lib/cos/chat-intelligence'
import type { ExternalSignalInput } from '@/lib/cos/external-signals'

export type SearchResult = {
  title: string
  url: string
  snippet: string
  // Provider-reported content date when available. For Brave Web Search this is the
  // result `age` field (the page's relevant published/updated timestamp), not the time
  // COS retrieved the result. Keeping the two timestamps separate prevents an old
  // article retrieved now from masquerading as newly published evidence.
  sourceDate?: string
  // Structured real-time providers annotate observations explicitly. Generic web-search
  // results leave these fields unset.
  sourceKind?: 'structured_realtime'
  observedAt?: string
  // Government-rules/procedure queries rank official sources first; the tier is carried so the
  // formatted evidence labels each result honestly. See officialSourceAuthority.ts.
  authorityTier?: AuthorityTier
}
export type ExternalInfoOptions = { bypassCache?: boolean }

export interface WebSearchPort {
  // Return up to `count` results, or throw Error(message) explaining why none.
  search(query: string, count: number): Promise<SearchResult[]>
}

const cache = new Map<string, { at: number; results: SearchResult[] }>()
const CACHE_MS = 5 * 60 * 1000 // 5 minutes — never used for explicit live volatile-fact checks.
const MAX_CACHE_ENTRIES = 50
const DEFAULT_RESULT_COUNT = 10
const MAX_RESULT_COUNT = 12

// Public-office identity is a primary-source problem, not a media-consensus problem. General-news
// outlets are intentionally excluded from the usable evidence set for this narrow query class.
// They remain available for actual news/research queries elsewhere in COS.
const GENERAL_NEWS_MEDIA_HOST_SUFFIXES = [
  'cnn.com',
  'foxnews.com',
  'msnbc.com',
  'bbc.com',
  'bbc.co.uk',
  'nbcnews.com',
  'cbsnews.com',
  'abcnews.go.com',
  'reuters.com',
  'apnews.com',
  'politico.com',
  'theguardian.com',
  'nytimes.com',
  'washingtonpost.com',
  'usatoday.com',
  'newsweek.com',
  'npr.org',
  'aljazeera.com',
  'bloomberg.com',
  'cnbc.com',
  'forbes.com',
] as const

const PUBLIC_OFFICE_ROLE_RE = /\b(?:president|vice\s+president|prime\s+minister|premier|chancellor|governor|mayor|secretary\s+of\s+state|attorney\s+general|speaker|minister|monarch|king|queen|pope)\b/i
const CURRENT_OFFICE_MARKER_RE = /\b(?:current|currently|now|today|at\s+present)\b/i
const MEDIA_STYLE_TITLE_RE = /\b(?:breaking\s+news|latest\s+news|headlines|news\s+and\s+analysis|live\s+updates)\b/i

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isGeneralNewsMediaResult(result: Pick<SearchResult, 'title' | 'url'>): boolean {
  const host = sourceHost(result.url)
  if (!host) return false
  if (GENERAL_NEWS_MEDIA_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return true
  return MEDIA_STYLE_TITLE_RE.test(String(result.title || ''))
}

export function isCurrentPublicOfficeQuery(query: string): boolean {
  const text = String(query || '')
  return PUBLIC_OFFICE_ROLE_RE.test(text) && CURRENT_OFFICE_MARKER_RE.test(text)
}

// ── Default adapter: Brave Search ─────────────────────────────────────────────
let searchPort: WebSearchPort | null = null

function defaultSearchPort(): WebSearchPort {
  return {
    async search(query: string, count: number): Promise<SearchResult[]> {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY
      if (!apiKey) {
        const pages = await searchPublicWeb(query, count)
        if (!pages.length) throw new Error('Public web discovery returned no pages.')
        return pages.map(page => ({ title: page.title, url: page.url, snippet: page.snippet }))
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': apiKey,
          },
        })

        if (!res.ok) {
          const pages = await searchPublicWeb(query, count)
          if (!pages.length) throw new Error(`Search API returned ${res.status}.`)
          return pages.map(page => ({ title: page.title, url: page.url, snippet: page.snippet }))
        }

        const json = await res.json()
        const raw = json?.web?.results
        if (!Array.isArray(raw) || raw.length === 0) throw new Error('No results found.')

        return raw.slice(0, count).map((r: any) => ({
          title: String(r?.title || '').slice(0, 200),
          url: String(r?.url || ''),
          snippet: String(r?.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
          sourceDate: typeof r?.age === 'string' && r.age.trim() ? r.age.trim().slice(0, 80) : undefined,
        })).filter((r: SearchResult) => r.title && r.url)
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export function setWebSearchPort(p: WebSearchPort): void { searchPort = p }
export function getWebSearchPort(): WebSearchPort { return searchPort ?? defaultSearchPort() }

function isFreshnessQuery(query: string): boolean {
  const q = String(query || '').toLowerCase()
  return /\bcurrent\b/.test(q)
    && /\b(?:latest|today|now|as of)\b/.test(q)
    && /\b(?:authoritative|official|verification)\b/.test(q)
}

function structuredProviderQuery(query: string): string {
  const stripped = String(query || '').replace(
    /\s+current\s+latest\s+official\s+authoritative\s+independent\s+verification\s+as\s+of\s+\d{4}-\d{2}-\d{2}\s*$/i,
    '',
  ).trim()
  return stripped || String(query || '').trim()
}

function clampSearchQuery(query: string): string {
  const collapsed = String(query || '').replace(/\s+/g, ' ').trim()
  const words = collapsed.split(' ')
  const bounded = words.length > 45 ? words.slice(0, 45).join(' ') : collapsed
  return bounded.length > 380 ? bounded.slice(0, 380).replace(/\s+\S*$/, '') : bounded
}

export async function getExternalInfo(
  query: string,
  requestedCount = DEFAULT_RESULT_COUNT,
  options: ExternalInfoOptions = {},
): Promise<{ ok: boolean; results: SearchResult[]; error?: string; notice?: string }> {
  const q = String(query || '').trim().slice(0, 400)
  if (!q) return { ok: false, results: [], error: 'Empty search query.' }
  const count = Math.max(1, Math.min(Number(requestedCount) || DEFAULT_RESULT_COUNT, MAX_RESULT_COUNT))
  const bypassCache = options.bypassCache === true || isFreshnessQuery(q)

  // High-frequency values are not allowed to degrade to ordinary web snippets. The structured
  // provider is the system-of-record boundary for this class; if unavailable, return failure so
  // the caller can fail closed rather than synthesize a potentially stale value.
  if (bypassCache) {
    const structuredQuery = structuredProviderQuery(q)
    const structuredKind = structuredLiveDataKind(structuredQuery)
    if (structuredKind) {
      const structured = await getStructuredLiveInfo(structuredQuery, structuredKind)
      return {
        ok: structured.ok,
        results: structured.results,
        ...(structured.error ? { error: structured.error } : {}),
      }
    }
  }

  const key = `${count}:${q.toLowerCase()}`
  if (!bypassCache) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return { ok: true, results: hit.results }
    }
  }

  try {
    // Authority-owned questions (government procedure, product behavior, medical guidance,
    // standards) get owner-first evidence: the same judgement a careful human applies by asking
    // "whose fact is this?" and going there — gov.pl for a Polish procedure, docs.stripe.com for a
    // Stripe question — recognized structurally, with no country or vendor tables. Mirrors the
    // existing public-office policy below; secondary sources are demoted and labelled, not removed.
    const authorityNeed = classifyAuthoritativeSourceNeed(q)
    // Provider hard limits enforced at the boundary: the search API rejects queries over ~400
    // characters or ~50 words with HTTP 422 (observed in production 2026-08-22 — a paragraph-length
    // legal question 422'd, returned zero sources, and made the fail-closed path abstain on a
    // question the open web answers easily). No caller should need to know provider limits.
    const searchQuery = clampSearchQuery(authorityNeed.required ? augmentQueryForOfficialSources(q, authorityNeed) : q)

    const rawResults = await getWebSearchPort().search(searchQuery, count)
    const enforcePrimaryOfficeSources = isCurrentPublicOfficeQuery(q)
    const filtered = enforcePrimaryOfficeSources
      ? rawResults.filter(result => !isGeneralNewsMediaResult(result))
      : rawResults
    const results: SearchResult[] = authorityNeed.required ? rankByAuthority(filtered, authorityNeed) : filtered

    if (!results.length) {
      return {
        ok: false,
        results: [],
        error: enforcePrimaryOfficeSources && rawResults.length
          ? 'No non-media authoritative/reference results survived the public-office source policy.'
          : 'No results found.',
      }
    }

    // A truly-live caller deliberately bypasses both cache read and cache write. This prevents a
    // later current-fact request from inheriting evidence captured on an earlier request.
    if (!bypassCache) {
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, { at: Date.now(), results })
    }

    const coverageNote = authorityNeed.required
      ? officialCoverageNote(results.map(result => ({ authorityTier: result.authorityTier ?? 'secondary' })), authorityNeed)
      : null
    return { ok: true, results, ...(coverageNote ? { notice: coverageNote } : {}) }
  } catch (e) {
    return { ok: false, results: [], error: e instanceof Error ? e.message : 'Search request failed.' }
  }
}

function signalFromResult(query: string, result: SearchResult, index: number): ExternalSignalInput {
  const text = `${query} ${result.title} ${result.snippet}`.toLowerCase()
  const observed_format = text.includes('short') || text.includes('reel') ? 'niche_short_9x16' : text.includes('tour') || text.includes('demo') ? 'platform_tour_16x9' : undefined
  const observed_hero = text.includes('presenter') || text.includes('spokesperson') ? 'talking_head_avatar' : text.includes('mascot') ? 'animated_mascot' : text.includes('dashboard') || text.includes('product') ? 'faceless_dashboard_tour' : undefined
  return {
    source_type: 'web_research',
    source_name: `support_live_result_${index + 1}`,
    source_url: result.url,
    audience: 'small business owners and operators',
    region: 'global',
    product: `${hostBrandName()} platform`,
    observed_format,
    observed_hero,
    confidence: Math.max(52, 68 - index * 3),
    notes: [`query=${query}`, `title=${result.title}`, `snippet=${result.snippet}`],
  }
}

function shouldAttachCosIntelligence(query: string) {
  const text = query.toLowerCase()
  return ['video', 'marketing', 'campaign', 'short', 'tour', 'audience', 'traffic', 'monetization', 'sales'].some(token => text.includes(token))
}

export function formatExternalInfoForAI(query: string, results: SearchResult[]): string {
  const authorityLabel = (r: SearchResult) => r.authorityTier === 'first_party'
    ? ' [FIRST-PARTY / OWNING AUTHORITY]'
    : r.authorityTier === 'institutional' ? ' [OFFICIAL INSTITUTION]' : ''
  const lines = results.map((r, i) => `${i + 1}. ${r.title}${authorityLabel(r)}\n   ${r.url}\n   ${r.snippet}`)
  const need = classifyAuthoritativeSourceNeed(query)
  const note = officialCoverageNote(results.map(r => ({ authorityTier: r.authorityTier ?? 'secondary' })), need)
  if (note) lines.push(`CAVEAT: ${note}`)
  if (need.required && results.some(r => r.authorityTier && r.authorityTier !== 'secondary')) {
    lines.push('PROACTIVE: after answering the question itself, add a short "Also worth checking" note listing any ADJACENT obligations or related procedures that the retrieved sources above explicitly mention but the user did not ask about, each cited with its source URL from the results above. Only include items literally supported by the retrieved text; if the sources mention none, omit the note entirely — never invent related obligations from model memory.')
  }
  const base = `Live web search results for "${query}" (retrieved just now — treat as current external data, cite sources by URL when making claims):\n\n${lines.join('\n\n')}`

  if (!shouldAttachCosIntelligence(query)) return base
  const externalSignals = results.map((result, index) => signalFromResult(query, result, index))
  const intelligence = buildCosChatIntelligence({ user_text: query, external_signals: externalSignals })
  return `${base}\n\n${intelligence.formatted_for_chat}`
}
