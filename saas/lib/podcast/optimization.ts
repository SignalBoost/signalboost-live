export type PodcastCategory = 'audio' | 'metadata' | 'distribution' | 'seo' | 'accessibility'
export type PodcastPriority = 'high' | 'medium' | 'low'

export type PodcastEpisode = {
  id: string
  title: string
  description: string
  audioUrl: string
  duration: string
  transcript: string
  publishedAt: string
  keywords: string[]
}

export type PodcastRecommendation = {
  category: PodcastCategory
  priority: PodcastPriority
  recommendation: string
  suggested_fix: Record<string, unknown>
}

export type PodcastAudit = {
  id: string
  feed_url: string
  show: {
    title: string
    description: string
    language: string
    author: string
    artwork: string
    category: string
  }
  episodes: PodcastEpisode[]
  audio_quality_score: number
  metadata_score: number
  distribution_score: number
  seo_score: number
  accessibility_score: number
  overall_score: number
  recommendations: PodcastRecommendation[]
  raw_report: Record<string, unknown>
}

export type OptimizedMetadata = {
  episodeId: string
  title: string
  subtitle: string
  description: string
  showNotes: string[]
  keywords: string[]
  transcript: string
  accessibilitySummary: string
  jsonLd: Record<string, unknown>
}

export type PodcastRebuild = {
  id: string
  source_feed: string
  status: 'pending' | 'generated' | 'applied'
  generated_feed: Record<string, unknown>
  generated_metadata: Record<string, unknown>
  generated_transcripts: Record<string, unknown>
  rssXml: string
}

type FeedParseResult = Omit<PodcastAudit, 'id' | 'feed_url' | 'overall_score' | 'recommendations' | 'raw_report'> & {
  raw: string
  resolvedFeedUrl: string
}

const CATEGORY_WEIGHTS: Record<PodcastCategory, number> = {
  audio: 0.18,
  metadata: 0.26,
  distribution: 0.2,
  seo: 0.22,
  accessibility: 0.14,
}

function decode(value = ''): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value = ''): string {
  return decode(value.replace(/<[^>]+>/g, ' '))
}

function tagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decode(match[1]) : ''
}

function tagAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*?\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? decode(match[1]) : ''
}

function allTagContents(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(match => decode(match[1]))
}

function isPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return normalized === 'localhost' || normalized.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(normalized) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) || normalized === '0.0.0.0' || normalized === '::1'
}

export function normalizeFeedUrl(input: string): string {
  const value = input.trim()
  if (!value) throw new Error('Feed URL is required.')
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS feeds are supported.')
  if (isPrivateHost(url.hostname)) throw new Error('Private or local feed hosts are not allowed.')
  return url.toString()
}

async function fetchText(url: string, accept = 'application/rss+xml, application/xml, text/xml, text/html;q=0.8'): Promise<{ text: string; finalUrl: string; status: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: accept, 'User-Agent': 'SignalBoostPodcastOptimizer/1.0' },
    })
    const text = (await response.text()).slice(0, 2_500_000)
    return { text, finalUrl: response.url || url, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

async function resolveAppleFeed(url: string): Promise<string | null> {
  const match = url.match(/id(\d+)/)
  if (!match) return null
  const response = await fetch(`https://itunes.apple.com/lookup?id=${match[1]}&entity=podcast`, { headers: { 'User-Agent': 'SignalBoostPodcastOptimizer/1.0' } })
  const data = await response.json()
  return typeof data?.results?.[0]?.feedUrl === 'string' ? data.results[0].feedUrl : null
}

function score(parts: boolean[]): number {
  if (!parts.length) return 0
  return Math.round((parts.filter(Boolean).length / parts.length) * 100)
}

function keywordsFrom(...values: string[]): string[] {
  const stop = new Set('the and for with from this that your you are our into about show episode podcast audio'.split(' '))
  return [...new Set(values.join(' ').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(word => word.length > 3 && !stop.has(word)))].slice(0, 12)
}

function parseFeed(xml: string, resolvedFeedUrl: string): FeedParseResult {
  const itemStart = xml.search(/<item[\s>]/i)
  const channel = itemStart >= 0 ? xml.slice(0, itemStart) : xml
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  const title = tagContent(channel, 'title') || 'Untitled podcast'
  const description = stripTags(tagContent(channel, 'itunes:summary') || tagContent(channel, 'description'))
  const language = tagContent(channel, 'language') || 'en'
  const author = tagContent(channel, 'itunes:author') || tagContent(channel, 'author')
  const artwork = tagAttr(channel, 'itunes:image', 'href') || tagContent(channel, 'image')
  const category = tagAttr(channel, 'itunes:category', 'text')
  const ownerEmail = tagContent(channel, 'itunes:email') || tagContent(channel, 'email')
  const explicit = tagContent(channel, 'itunes:explicit')
  const link = tagContent(channel, 'link')

  const episodes = itemBlocks.slice(0, 25).map((item, index) => {
    const itemTitle = tagContent(item, 'title') || `Episode ${index + 1}`
    const itemDescription = stripTags(tagContent(item, 'itunes:summary') || tagContent(item, 'description'))
    const transcript = allTagContents(item, 'podcast:transcript').join('\n') || tagContent(item, 'transcript')
    return {
      id: tagContent(item, 'guid') || `episode-${index + 1}`,
      title: itemTitle,
      description: itemDescription,
      audioUrl: tagAttr(item, 'enclosure', 'url'),
      duration: tagContent(item, 'itunes:duration'),
      transcript,
      publishedAt: tagContent(item, 'pubDate'),
      keywords: keywordsFrom(itemTitle, itemDescription),
    }
  })

  const enclosureTypes = itemBlocks.map(item => tagAttr(item, 'enclosure', 'type'))
  const episodeDescriptions = episodes.map(episode => episode.description)
  const audio_quality_score = score([
    episodes.length > 0,
    episodes.every(episode => episode.audioUrl),
    enclosureTypes.some(type => /mpeg|mp3|mp4|x-m4a/i.test(type)),
    episodes.some(episode => episode.duration),
    episodes.every(episode => !episode.audioUrl || /^https:\/\//i.test(episode.audioUrl)),
  ])
  const metadata_score = score([Boolean(title), description.length >= 120, Boolean(author), Boolean(category), Boolean(artwork), Boolean(ownerEmail), Boolean(language), Boolean(explicit)])
  const distribution_score = score([/^https:\/\//i.test(resolvedFeedUrl), Boolean(link), Boolean(ownerEmail), Boolean(category), /podcast:locked/i.test(xml) || /atom:link/i.test(xml), episodes.length >= 3])
  const seo_score = score([description.length >= 160, keywordsFrom(title, description, ...episodeDescriptions).length >= 6, episodes.some(ep => ep.keywords.length >= 4), episodes.every(ep => ep.title.length >= 12), episodes.some(ep => ep.description.length >= 140)])
  const accessibility_score = score([episodes.some(ep => ep.transcript), /podcast:transcript/i.test(xml), Boolean(language), episodes.some(ep => /caption|transcript|show notes/i.test(ep.description)), episodes.every(ep => ep.description.length > 0)])

  return {
    raw: xml,
    resolvedFeedUrl,
    show: { title, description, language, author, artwork, category },
    episodes,
    audio_quality_score,
    metadata_score,
    distribution_score,
    seo_score,
    accessibility_score,
  }
}

function recommendation(category: PodcastCategory, priority: PodcastPriority, recommendation: string, suggested_fix: Record<string, unknown>): PodcastRecommendation {
  return { category, priority, recommendation, suggested_fix }
}

function recommendationsFor(parsed: FeedParseResult): PodcastRecommendation[] {
  const recs: PodcastRecommendation[] = []
  if (parsed.audio_quality_score < 80) recs.push(recommendation('audio', parsed.audio_quality_score < 50 ? 'high' : 'medium', 'Normalize episode audio delivery with HTTPS enclosure URLs, valid audio MIME types, and durations for every episode.', { enclosure: { require_https: true, accepted_types: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a'], include_itunes_duration: true } }))
  if (parsed.metadata_score < 85) recs.push(recommendation('metadata', parsed.metadata_score < 55 ? 'high' : 'medium', 'Complete Apple and Spotify show metadata: author, category, owner email, artwork, language, explicit rating, and a substantive show description.', { channel_fields: ['itunes:author', 'itunes:category', 'itunes:owner', 'itunes:image', 'language', 'itunes:explicit', 'itunes:summary'] }))
  if (parsed.distribution_score < 80) recs.push(recommendation('distribution', 'medium', 'Harden distribution readiness with HTTPS feed hosting, self-referencing atom link, owner verification, and at least three published episodes.', { feed: { https: true, atom_self_link: true, claim_ready_owner_email: true, minimum_episode_count: 3 } }))
  if (parsed.seo_score < 80) recs.push(recommendation('seo', parsed.seo_score < 50 ? 'high' : 'medium', 'Rewrite show and episode copy around searchable listener intent, clear benefits, named topics, guests, and consistent keywords.', { seo: { title_minimum_characters: 12, description_minimum_characters: 160, keyword_clusters: keywordsFrom(parsed.show.title, parsed.show.description).slice(0, 8) } }))
  if (parsed.accessibility_score < 80) recs.push(recommendation('accessibility', parsed.accessibility_score < 50 ? 'high' : 'medium', 'Publish transcripts for every episode using the Podcasting 2.0 transcript tag and include readable show notes.', { transcript: { tag: 'podcast:transcript', formats: ['text/vtt', 'application/srt', 'text/plain'], required_per_episode: true } }))
  if (!recs.length) recs.push(recommendation('distribution', 'low', 'Feed is marketplace-ready. Continue monitoring new episodes for metadata consistency, transcripts, and directory compliance.', { monitoring: { cadence: 'after_every_publish', checks: ['audio', 'metadata', 'distribution', 'seo', 'accessibility'] } }))
  return recs
}

export async function analyzePodcastFeed(feedUrl: string): Promise<PodcastAudit> {
  let normalized = normalizeFeedUrl(feedUrl)
  if (/podcasts\.apple\.com/i.test(normalized)) {
    const appleFeed = await resolveAppleFeed(normalized)
    if (appleFeed) normalized = normalizeFeedUrl(appleFeed)
  }
  const fetched = await fetchText(normalized)
  if (fetched.status >= 400) throw new Error(`Feed returned HTTP ${fetched.status}.`)
  if (!/<rss|<feed|<channel/i.test(fetched.text)) throw new Error('The URL did not return a valid RSS/Atom podcast feed.')
  const parsed = parseFeed(fetched.text, fetched.finalUrl)
  const recommendations = recommendationsFor(parsed)
  const overall_score = Math.round(parsed.audio_quality_score * CATEGORY_WEIGHTS.audio + parsed.metadata_score * CATEGORY_WEIGHTS.metadata + parsed.distribution_score * CATEGORY_WEIGHTS.distribution + parsed.seo_score * CATEGORY_WEIGHTS.seo + parsed.accessibility_score * CATEGORY_WEIGHTS.accessibility)
  return {
    id: crypto.randomUUID(),
    feed_url: parsed.resolvedFeedUrl,
    show: parsed.show,
    episodes: parsed.episodes,
    audio_quality_score: parsed.audio_quality_score,
    metadata_score: parsed.metadata_score,
    distribution_score: parsed.distribution_score,
    seo_score: parsed.seo_score,
    accessibility_score: parsed.accessibility_score,
    overall_score,
    recommendations,
    raw_report: {
      analyzed_at: new Date().toISOString(),
      source_bytes_scanned: fetched.text.length,
      episode_count: parsed.episodes.length,
      score_weights: CATEGORY_WEIGHTS,
    },
  }
}

export function optimizeEpisodeMetadata(audit: PodcastAudit, episodeId?: string): OptimizedMetadata {
  const episode = audit.episodes.find(item => item.id === episodeId) || audit.episodes[0]
  if (!episode) throw new Error('No episodes are available to optimize.')
  const keywords = [...new Set([...episode.keywords, ...keywordsFrom(audit.show.title, audit.show.description)])].slice(0, 10)
  const coreTopic = keywords.slice(0, 3).join(', ') || audit.show.title
  const title = episode.title.length >= 58 ? episode.title.slice(0, 55).trim() + '…' : `${episode.title} | ${audit.show.title}`.slice(0, 68)
  const subtitle = `A searchable, listener-first episode on ${coreTopic}.`
  const description = [
    `${episode.description || audit.show.description}`,
    `In this episode, listeners get a clear breakdown of ${coreTopic} with practical takeaways from ${audit.show.title}.`,
    `Subscribe for more conversations, transcripts, and resources designed for discoverability and accessibility.`,
  ].filter(Boolean).join('\n\n')
  const showNotes = [
    `Hook: Open with the listener problem behind ${keywords[0] || 'the topic'}.`,
    `Value: Summarize three takeaways in the first 90 seconds.`,
    `Discovery: Mention ${keywords.slice(0, 5).join(', ')} naturally in the notes.`,
    'Accessibility: Publish a transcript and chapter markers with the episode.',
  ]
  const transcript = episode.transcript || `[Transcript draft]\n${episode.title}\n\n${description}\n\nSpeaker notes should be replaced by the approved human-edited transcript before publishing.`
  return {
    episodeId: episode.id,
    title,
    subtitle,
    description,
    showNotes,
    keywords,
    transcript,
    accessibilitySummary: 'Transcript-ready metadata includes readable notes, semantic keywords, and a plain-language episode summary.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'PodcastEpisode',
      name: title,
      description,
      partOfSeries: { '@type': 'PodcastSeries', name: audit.show.title },
      keywords,
      associatedMedia: episode.audioUrl ? { '@type': 'MediaObject', contentUrl: episode.audioUrl, encodingFormat: 'audio' } : undefined,
      datePublished: episode.publishedAt || undefined,
    },
  }
}

function xmlEscape(value = ''): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function rebuildPodcastFeed(audit: PodcastAudit): PodcastRebuild {
  const optimizedEpisodes = audit.episodes.slice(0, 20).map(episode => optimizeEpisodeMetadata(audit, episode.id))
  const generated_metadata = {
    title: audit.show.title,
    description: audit.show.description || `The official podcast feed for ${audit.show.title}.`,
    language: audit.show.language || 'en',
    author: audit.show.author || audit.show.title,
    category: audit.show.category || 'Business',
    artwork: audit.show.artwork,
    explicit: false,
    ownerVerificationReady: true,
  }
  const generated_transcripts = Object.fromEntries(optimizedEpisodes.map(item => [item.episodeId, { transcript: item.transcript, format: 'text/plain', accessibilitySummary: item.accessibilitySummary }]))
  const generated_feed = {
    version: 'rss-2.0-podcasting-2.0',
    namespaces: ['itunes', 'atom', 'podcast'],
    selfLink: audit.feed_url,
    metadata: generated_metadata,
    episodes: optimizedEpisodes,
  }
  const rssItems = optimizedEpisodes.map(item => {
    const source = audit.episodes.find(episode => episode.id === item.episodeId)
    return `    <item>\n      <guid>${xmlEscape(item.episodeId)}</guid>\n      <title>${xmlEscape(item.title)}</title>\n      <description>${xmlEscape(item.description)}</description>\n      <itunes:summary>${xmlEscape(item.subtitle)}</itunes:summary>\n      ${source?.audioUrl ? `<enclosure url="${xmlEscape(source.audioUrl)}" type="audio/mpeg" />` : ''}\n      <podcast:transcript type="text/plain">${xmlEscape(item.transcript)}</podcast:transcript>\n    </item>`
  }).join('\n')
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">\n  <channel>\n    <title>${xmlEscape(String(generated_metadata.title))}</title>\n    <description>${xmlEscape(String(generated_metadata.description))}</description>\n    <language>${xmlEscape(String(generated_metadata.language))}</language>\n    <itunes:author>${xmlEscape(String(generated_metadata.author))}</itunes:author>\n    <itunes:category text="${xmlEscape(String(generated_metadata.category))}" />\n    ${generated_metadata.artwork ? `<itunes:image href="${xmlEscape(String(generated_metadata.artwork))}" />` : ''}\n    <atom:link href="${xmlEscape(audit.feed_url)}" rel="self" type="application/rss+xml" />\n${rssItems}\n  </channel>\n</rss>`
  return {
    id: crypto.randomUUID(),
    source_feed: audit.feed_url,
    status: 'generated',
    generated_feed,
    generated_metadata,
    generated_transcripts,
    rssXml,
  }
}
