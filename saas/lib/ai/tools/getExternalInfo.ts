// saas/lib/ai/tools/getExternalInfo.ts
// Live web search for the Chief of Staff.
// Returns structured top results (title, url, snippet) for market/competitor/news queries.
//
// PORTABLE: search providers are injected. Ordinary web retrieval uses WebSearchPort;
// high-frequency public values (weather/financial/sports) use StructuredLiveDataPort so
// COS never mistakes an ordinary web snippet for a real-time feed.

import { structuredLiveDataKind } from '@/lib/ai/cos/cosFreshnessPolicy'
import { getStructuredLiveInfo } from '@/lib/ai/tools/getStructuredLiveInfo'
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

// COS source-governance exclusion boundary. Results from these hosts are not usable live
// evidence and therefore cannot flow into grounding, provenance, research retention, or cache.
const EXCLUDED_LIVE_SOURCE_HOSTS = new Set([
  'cnn.com',
])

function liveSourceHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isExcludedLiveSource(url: string): boolean {
  const host = liveSourceHost(url)
  if (!host) return true
  for (const excluded of EXCLUDED_LIVE_SOURCE_HOSTS) {
    if (host === excluded || host.endsWith(`.${excluded}`)) return true
  }
  return false
}

// ── Default adapter: Brave Search ─────────────────────────────────────────────
let searchPort: WebSearchPort | null = null

function defaultSearchPort(): WebSearchPort {
  return {
    async search(query: string, count: number): Promise<SearchResult[]> {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY
      if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is not configured in environment variables.')

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

        if (!res.ok) throw new Error(`Search API returned ${res.status}.`)

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

export async function getExternalInfo(
  query: string,
  requestedCount = DEFAULT_RESULT_COUNT,
  options: ExternalInfoOptions = {},
): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
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
    const rawResults = await getWebSearchPort().search(q, count)
    const results = rawResults.filter(result => !isExcludedLiveSource(result.url))
    if (!results.length) {
      const rejected = rawResults.length > 0
      return {
        ok: false,
        results: [],
        error: rejected ? 'Search results did not meet COS live-source policy.' : 'No results found.',
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

    return { ok: true, results }
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
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
  const base = `Live web search results for "${query}" (retrieved just now — treat as current external data, cite sources by URL when making claims):\n\n${lines.join('\n\n')}`

  if (!shouldAttachCosIntelligence(query)) return base
  const externalSignals = results.map((result, index) => signalFromResult(query, result, index))
  const intelligence = buildCosChatIntelligence({ user_text: query, external_signals: externalSignals })
  return `${base}\n\n${intelligence.formatted_for_chat}`
}