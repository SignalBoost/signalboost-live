// saas/lib/cos-core/layers/learning/referenceClients.ts
//
// CURRENT GENERAL FACTS — the source class COS did not have.
//
// COS answered that George Foreman (died March 2025) and Hulk Hogan (died July 2025) were both
// alive. That is not a prompting bug or a guard bug; it is an ACQUISITION bug. Look at what the
// daily cycle is allowed to fetch: Crossref, OpenAlex, Europe PMC, Open Library, GDELT, official
// tech doc feeds, YouTube. Every one of those is a technical or academic source. Nothing in the
// catalogue can tell COS whether a person is alive, who currently runs a company, or what happened
// last year — so COS answers those from frozen model weights and is confidently two years stale.
//
// Wikipedia fills exactly that gap: continuously updated, freely licensed, no API key, and it covers
// the entity/person/status questions the rest of the catalogue structurally cannot. It is not a
// replacement for the technical sources; it is the missing general-knowledge tier beneath them.
//
// It is also honest about its own currency — every result carries the page's last-modified
// timestamp as observedAt, so downstream freshness checks work on a real date rather than on
// "whenever we happened to fetch it".

import type { LearningConnectorResult, LearningConnectorSearch } from './connectors.ts'

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
/** Wikipedia asks for a descriptive agent with contact info; anonymous bulk requests get throttled. */
const USER_AGENT = 'SignalBoost-COS/1.0 (continuous learning; contact via signalboostapp.com)'
const REQUEST_TIMEOUT_MS = 10_000

type FetchLike = typeof fetch

async function getJson(url: string, fetchImpl: FetchLike): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    // Acquisition failures are counted by the cycle's sourceErrors; never throw into the daily run.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Search Wikipedia, then fetch each hit's intro extract and last-modified date.
 *
 * Two calls rather than one: search alone returns a snippet with HTML markup and no revision date,
 * and a document with no trustworthy date cannot support a freshness judgement later. The extract
 * also carries the lead section, which is where "died on <date>" actually lives for a biography.
 */
export function createWikipediaSearch(fetchImpl: FetchLike = fetch): LearningConnectorSearch {
  return async (query: string, limit: number): Promise<LearningConnectorResult[]> => {
    const term = String(query ?? '').trim()
    if (!term) return []
    const capped = Math.max(1, Math.min(10, Math.floor(limit) || 3))

    const searchUrl = `${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=${capped}&format=json&origin=*`
    const searchPayload = await getJson(searchUrl, fetchImpl)
    const hits: Array<{ title?: string; pageid?: number }> = searchPayload?.query?.search ?? []
    if (!Array.isArray(hits) || hits.length === 0) return []

    const titles = hits.map(hit => String(hit?.title ?? '')).filter(Boolean).slice(0, capped)
    if (!titles.length) return []

    const extractUrl = `${WIKIPEDIA_API}?action=query&prop=extracts|info&exintro=1&explaintext=1&inprop=url&titles=${encodeURIComponent(titles.join('|'))}&format=json&origin=*`
    const extractPayload = await getJson(extractUrl, fetchImpl)
    const pages: Record<string, any> = extractPayload?.query?.pages ?? {}

    const results: LearningConnectorResult[] = []
    for (const page of Object.values(pages)) {
      const text = String(page?.extract ?? '').trim()
      const title = String(page?.title ?? '').trim()
      // A stub with no prose teaches nothing and would only dilute relevance scoring.
      if (!text || text.length < 120 || !title) continue
      results.push({
        uri: String(page?.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`),
        title,
        text,
        // The page's own revision date, not fetch time — so freshness checks mean something.
        observedAt: page?.touched ? String(page.touched) : undefined,
        license: 'CC BY-SA 4.0',
      })
    }
    return results.slice(0, capped)
  }
}
