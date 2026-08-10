import type { LearningConnectorResult, LearningConnectorSearch } from './connectors'

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
export function createFeedSearch(feeds: LearningFeed[], fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const tokens = queryTokens(query)
    const candidates: Array<LearningConnectorResult & { relevance: number }> = []

    for (const feed of feeds.slice(0, 20)) {
      try {
        const response = await fetcher(feed.url, {
          headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) continue
        const xml = await response.text()
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

    return candidates
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, Math.min(Math.max(limit, 1), 10))
      .map(({ relevance: _relevance, ...item }) => item)
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
