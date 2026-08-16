import type { SearchResult } from './getExternalInfo'

export type StructuredLiveKind = 'weather' | 'financial' | 'sports'
export type StructuredSearchResult = SearchResult & {
  sourceKind: 'structured_realtime'
  observedAt: string
}

export type StructuredLiveInfoResult = {
  ok: boolean
  results: StructuredSearchResult[]
  vertical?: string
  error?: string
}

export interface StructuredLiveDataPort {
  fetch(query: string, expectedKind: StructuredLiveKind): Promise<StructuredLiveInfoResult>
}

let structuredLiveDataPort: StructuredLiveDataPort | null = null

export function setStructuredLiveDataPort(port: StructuredLiveDataPort): void {
  structuredLiveDataPort = port
}

function publicSearchUrl(query: string): string {
  return `https://search.brave.com/search?q=${encodeURIComponent(query)}`
}

function defaultStructuredLiveDataPort(): StructuredLiveDataPort {
  return {
    async fetch(query: string, expectedKind: StructuredLiveKind): Promise<StructuredLiveInfoResult> {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY
      if (!apiKey) return { ok: false, results: [], error: 'BRAVE_SEARCH_API_KEY is not configured.' }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const headers = {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'X-Subscription-Token': apiKey,
      }

      try {
        const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search')
        searchUrl.searchParams.set('q', query)
        searchUrl.searchParams.set('count', '3')
        searchUrl.searchParams.set('enable_rich_callback', '1')

        const discovery = await fetch(searchUrl, { signal: controller.signal, cache: 'no-store', headers })
        if (!discovery.ok) return { ok: false, results: [], error: `Brave rich discovery returned ${discovery.status}.` }

        const discoveryJson: any = await discovery.json()
        const hint = discoveryJson?.rich?.hint
        const callbackKey = String(hint?.callback_key || '').trim()
        const vertical = String(hint?.vertical || '').trim().toLowerCase()
        if (!callbackKey) return { ok: false, results: [], vertical, error: 'No structured real-time callback was available for this query.' }

        const expectedVerticals: Record<StructuredLiveKind, Set<string>> = {
          weather: new Set(['weather']),
          financial: new Set(['stock', 'stocks', 'currency', 'cryptocurrency', 'crypto']),
          sports: new Set(['american_football', 'american football', 'football', 'soccer', 'baseball', 'basketball', 'cricket', 'ice_hockey', 'ice hockey', 'formula_1', 'formula 1', 'sports']),
        }
        if (vertical && !expectedVerticals[expectedKind].has(vertical)) {
          return { ok: false, results: [], vertical, error: `Structured provider returned unexpected vertical "${vertical}" for ${expectedKind}.` }
        }

        const richUrl = new URL('https://api.search.brave.com/res/v1/web/rich')
        richUrl.searchParams.set('callback_key', callbackKey)
        const rich = await fetch(richUrl, { signal: controller.signal, cache: 'no-store', headers })
        if (!rich.ok) return { ok: false, results: [], vertical, error: `Brave rich result returned ${rich.status}.` }

        const richJson: any = await rich.json()
        const rawResults = Array.isArray(richJson?.results) ? richJson.results : []
        if (!rawResults.length) return { ok: false, results: [], vertical, error: 'Structured provider returned no real-time records.' }

        const observedAt = new Date().toISOString()
        const compactPayload = JSON.stringify({ vertical: vertical || expectedKind, results: rawResults }).slice(0, 6000)

        return {
          ok: true,
          vertical: vertical || expectedKind,
          results: [{
            title: `Brave Rich Search real-time ${vertical || expectedKind} data`,
            url: publicSearchUrl(query),
            snippet: compactPayload,
            sourceKind: 'structured_realtime',
            observedAt,
          }],
        }
      } catch (error) {
        return { ok: false, results: [], error: error instanceof Error ? error.message : 'Structured real-time lookup failed.' }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export function getStructuredLiveDataPort(): StructuredLiveDataPort {
  return structuredLiveDataPort ?? defaultStructuredLiveDataPort()
}

export async function getStructuredLiveInfo(query: string, expectedKind: StructuredLiveKind): Promise<StructuredLiveInfoResult> {
  const q = String(query || '').trim().slice(0, 400)
  if (!q) return { ok: false, results: [], error: 'Empty structured live-data query.' }
  return getStructuredLiveDataPort().fetch(q, expectedKind)
}
