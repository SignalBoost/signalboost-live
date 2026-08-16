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

type Scalar = string | number | boolean

type ScalarEntry = { path: string; value: Scalar; score: number }

function scalarPriority(path: string): number {
  const key = path.toLowerCase()
  if (/\b(?:price|last|value|rate|exchange|currency|symbol|ticker)\b/.test(key)) return 100
  if (/\b(?:temperature|temp|condition|forecast|humidity|wind|precip|rain|snow)\b/.test(key)) return 95
  if (/\b(?:score|points|team|home|away|status|period|quarter|inning|time_remaining)\b/.test(key)) return 90
  if (/\b(?:name|title|date|time|timestamp|updated|market|change|percent|unit)\b/.test(key)) return 70
  return 10
}

function collectScalars(value: unknown, path = 'data', depth = 0, out: ScalarEntry[] = []): ScalarEntry[] {
  if (out.length >= 120 || depth > 7 || value == null) return out
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value
    if (text !== '') out.push({ path, value: text as Scalar, score: scalarPriority(path) })
    return out
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 8); index += 1) {
      collectScalars(value[index], `${path}[${index}]`, depth + 1, out)
    }
    return out
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectScalars(child, `${path}.${key}`, depth + 1, out)
      if (out.length >= 120) break
    }
  }
  return out
}

function compactStructuredSnippet(vertical: string, observedAt: string, rawResults: unknown[]): string {
  const entries = collectScalars(rawResults)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 28)
    .map(entry => `${entry.path}=${String(entry.value).slice(0, 80)}`)

  const prefix = `STRUCTURED_REALTIME vertical=${vertical}; observed_at=${observedAt}; `
  return `${prefix}${entries.join('; ')}`.slice(0, 480)
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
        const resolvedVertical = vertical || expectedKind
        const compactPayload = compactStructuredSnippet(resolvedVertical, observedAt, rawResults)

        return {
          ok: true,
          vertical: resolvedVertical,
          results: [{
            title: `Brave Rich Search real-time ${resolvedVertical} data`,
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
