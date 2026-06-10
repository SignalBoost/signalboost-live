// saas/lib/ai/tools/getExternalInfo.ts
// Live web search for the Chief of Staff via the Brave Search API.
// Returns structured top results (title, url, snippet) for market/competitor/news queries.
// Requires BRAVE_SEARCH_API_KEY in env. Free tier: 2,000 queries/month.

type SearchResult = { title: string; url: string; snippet: string }

const cache = new Map<string, { at: number; results: SearchResult[] }>()
const CACHE_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_ENTRIES = 50

export async function getExternalInfo(query: string): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
  const q = String(query || '').trim().slice(0, 400)
  if (!q) return { ok: false, results: [], error: 'Empty search query.' }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return { ok: false, results: [], error: 'BRAVE_SEARCH_API_KEY is not configured in environment variables.' }

  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { ok: true, results: hit.results }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return { ok: false, results: [], error: `Search API returned ${res.status}.` }
    }

    const json = await res.json()
    const raw = json?.web?.results
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, results: [], error: 'No results found.' }
    }

    const results: SearchResult[] = raw.slice(0, 6).map((r: any) => ({
      title: String(r?.title || '').slice(0, 200),
      url: String(r?.url || ''),
      snippet: String(r?.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
    })).filter((r: SearchResult) => r.title && r.url)

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { at: Date.now(), results })

    return { ok: true, results }
  } catch (e) {
    return { ok: false, results: [], error: e instanceof Error ? e.message : 'Search request failed.' }
  }
}

export function formatExternalInfoForAI(query: string, results: SearchResult[]): string {
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
  return `Live web search results for "${query}" (retrieved just now — treat as current external data, cite sources by URL when making claims):\n\n${lines.join('\n\n')}`
}
