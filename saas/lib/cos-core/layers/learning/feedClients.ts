import type { LearningConnectorResult, LearningConnectorSearch } from './connectors'
import { fetchReadableDocument } from './documentFetch'

type FetchLike = typeof fetch

export type LearningFeed = {
  url: string
  label?: string
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function first(block: string, tags: string[]): string {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    if (match?.[1]) return decode(match[1])
  }
  return ''
}

function link(block: string): string {
  const rss = first(block, ['link'])
  if (rss.startsWith('http')) return rss
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
  return atom || rss
}

function entries(xml: string): string[] {
  const rss = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  if (rss.length) return rss
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1])
}

function queryTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9][a-z0-9+.#-]{2,}/g) || [])].slice(0, 12)
}

function score(text: string, tokens: string[]): number {
  const haystack = text.toLowerCase()
  return tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
}

/**
 * Reads approved RSS/Atom feeds and retains only compact feed-provided summaries and
 * provenance. It does not scrape publisher article bodies. Feed URLs are explicitly
 * configured or supplied from the trusted built-in catalog.
 */
export type FeedSearchOptions = {
  /**
   * Fetch the page behind each selected entry instead of keeping the feed blurb. Enable ONLY for
   * source classes whose bodies COS is entitled to read in full — official vendor documentation,
   * standards bodies, government publications. Publisher article bodies stay summary-only, which is
   * why this is off by default.
   */
  fullText?: boolean
}

type FeedCacheEntry = {
  expiresAt: number
  promise: Promise<string>
}

/**
 * One learning cycle asks many questions of the same feed catalog. Cache raw RSS/Atom reads inside
 * the search instance so those questions reuse the same network response instead of refetching every
 * publication repeatedly. Successful feeds live for ten minutes; a failed feed is cooled for thirty
 * seconds so a publisher outage cannot turn into a burst loop.
 */
export function createFeedSearch(feeds: LearningFeed[], fetcher: FetchLike = fetch, options: FeedSearchOptions = {}): LearningConnectorSearch {
  const cache = new Map<string, FeedCacheEntry>()

  const readFeed = async (feed: LearningFeed): Promise<string> => {
    const now = Date.now()
    const cached = cache.get(feed.url)
    if (cached && cached.expiresAt > now) return await cached.promise
    if (cached) cache.delete(feed.url)

    const promise = (async () => {
      const response = await fetcher(feed.url, {
        headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`Feed HTTP ${response.status}`)
      return await response.text()
    })()

    const entry: FeedCacheEntry = { expiresAt: now + 30_000, promise }
    cache.set(feed.url, entry)
    promise.then(
      () => { entry.expiresAt = Date.now() + 10 * 60_000 },
      () => { entry.expiresAt = Date.now() + 30_000 },
    )
    return await promise
  }

  return async (query, limit) => {
    const tokens = queryTokens(query)
    const candidates: Array<LearningConnectorResult & { relevance: number }> = []

    for (const feed of feeds.slice(0, 20)) {
      try {
        const xml = await readFeed(feed)
        for (const block of entries(xml).slice(0, 40)) {
          const title = first(block, ['title'])
          const summary = first(block, ['description', 'summary', 'content:encoded', 'content'])
          const uri = link(block)
          const observedAt = first(block, ['pubDate', 'published', 'updated']) || undefined
          const compact = [title, summary, feed.label ? `Source: ${feed.label}.` : ''].filter(Boolean).join(' ')
          if (!uri || !compact) continue
          const relevance = tokens.length ? score(compact, tokens) : 1
          if (tokens.length && relevance === 0) continue
          candidates.push({
            uri,
            title,
            text: compact.slice(0, 4_000),
            observedAt,
            license: 'RSS/Atom feed-provided metadata and summary; article body not copied',
            relevance,
          })
        }
      } catch {
        // A failing publication must never abort the autonomous learning cycle.
      }
    }

    const selected = candidates
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, Math.min(Math.max(limit, 1), 10))
      .map(({ relevance: _relevance, ...item }) => item)

    if (!options.fullText) return selected

    // Bodies are fetched only for the entries that survived selection, never for all 40 parsed
    // entries: the ranking is free, the fetching is not.
    return Promise.all(selected.map(async (item) => {
      const body = await fetchReadableDocument(item.uri, { fetcher })
      return body
        ? { ...item, text: body, license: 'Official documentation page read in full from its published URL' }
        : item
    }))
  }
}

export function parseFeedList(value?: string): LearningFeed[] {
  return String(value || '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 20)
    .map((url) => ({ url }))
}

export const BUILTIN_OFFICIAL_TECH_FEEDS: LearningFeed[] = [
  { url: 'https://aws.amazon.com/blogs/aws/feed/', label: 'AWS News Blog' },
  { url: 'https://k8s.io/docs/reference/issues-security/official-cve-feed/feed.xml', label: 'Kubernetes Official CVE Feed' },
]

/**
 * Independent first-party technical-news fallback for discovery when GDELT is throttled or down.
 * These remain summary/metadata sources; article bodies are never copied by this adapter.
 */
export const BUILTIN_TECH_NEWS_FEEDS: LearningFeed[] = [
  { url: 'https://github.blog/changelog/feed/', label: 'GitHub Changelog' },
  { url: 'https://blog.cloudflare.com/rss/', label: 'Cloudflare Blog' },
  { url: 'https://kubernetes.io/feed.xml', label: 'Kubernetes Blog' },
]
