import type { LearningConnectorResult, LearningConnectorSearch } from './connectors'

type FetchLike = typeof fetch
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

export class LearningSourceFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly transient: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message)
    this.name = 'LearningSourceFetchError'
  }
}

type JsonRetryOptions = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.round(seconds * 1000))
  const date = Date.parse(raw)
  return Number.isFinite(date) ? Math.max(0, Math.min(60_000, date - Date.now())) : 0
}

async function json(
  fetcher: FetchLike,
  url: string,
  init?: RequestInit,
  options: JsonRetryOptions = {},
): Promise<any> {
  const attempts = Math.max(1, Math.min(5, Math.round(options.attempts ?? 3)))
  const baseDelayMs = Math.max(0, Math.min(10_000, Math.round(options.baseDelayMs ?? 250)))
  const maxDelayMs = Math.max(baseDelayMs, Math.min(30_000, Math.round(options.maxDelayMs ?? 4_000)))
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    let serverRetryAfterMs = 0
    try {
      const response = await fetcher(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'SignalBoost-COS/1.0',
          ...(init?.headers ?? {}),
        },
      })
      if (!response.ok) {
        const transient = TRANSIENT_STATUS.has(response.status)
        serverRetryAfterMs = retryAfterMs(response)
        const error = new LearningSourceFetchError(
          `COS learning source failed: ${response.status}`,
          response.status,
          transient,
          serverRetryAfterMs,
        )
        if (!transient) throw error
        lastError = error
      } else {
        return await response.json()
      }
    } catch (error) {
      lastError = error
      if (error instanceof LearningSourceFetchError && !error.transient) throw error
      if (attempt >= attempts - 1) throw error
    } finally {
      clearTimeout(timer)
    }

    if (attempt < attempts - 1) {
      const exponential = baseDelayMs * 2 ** attempt
      await delay(Math.min(maxDelayMs, Math.max(exponential, serverRetryAfterMs)))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('COS learning source failed')
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function compactQuery(query: string, maxTerms = 8): string {
  return clean(query).split(/\s+/).filter(Boolean).slice(0, maxTerms).join(' ')
}

function transcriptText(payload: any): string {
  if (typeof payload?.transcript === 'string') return clean(payload.transcript)
  if (typeof payload?.text === 'string') return clean(payload.text)
  if (Array.isArray(payload?.segments)) return clean(payload.segments.map((segment: any) => segment?.text ?? '').join(' '))
  if (Array.isArray(payload?.transcript)) return clean(payload.transcript.map((segment: any) => segment?.text ?? segment ?? '').join(' '))
  return ''
}

type DiscoveredYouTubeVideo = {
  videoId: string
  url: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string
}

async function discoverYouTubeVideos(apiKey: string, query: string, limit: number, fetcher: FetchLike): Promise<DiscoveredYouTubeVideo[]> {
  if (!apiKey) return []
  const maxResults = Math.min(Math.max(limit, 1), 10)
  const search = await json(
    fetcher,
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(compactQuery(query, 10))}&key=${encodeURIComponent(apiKey)}`,
  )
  return (search?.items ?? [])
    .map((item: any): DiscoveredYouTubeVideo => ({
      videoId: clean(item?.id?.videoId),
      url: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
      title: clean(item?.snippet?.title),
      description: clean(item?.snippet?.description),
      channelTitle: clean(item?.snippet?.channelTitle),
      publishedAt: clean(item?.snippet?.publishedAt),
    }))
    .filter((item: DiscoveredYouTubeVideo) => Boolean(item.videoId && item.url))
}

function createCachedYouTubeDiscovery(apiKey: string, fetcher: FetchLike) {
  const cache = new Map<string, Promise<DiscoveredYouTubeVideo[]>>()
  return async (query: string, limit: number) => {
    const normalized = compactQuery(query, 10).toLowerCase()
    const bounded = Math.min(Math.max(limit, 1), 10)
    const key = `${normalized}|${bounded}`
    let pending = cache.get(key)
    if (!pending) {
      pending = discoverYouTubeVideos(apiKey, normalized, bounded, fetcher)
      cache.set(key, pending)
      pending.catch(() => cache.delete(key))
    }
    return await pending
  }
}

function youtubeMetadataResult(item: DiscoveredYouTubeVideo, license = 'YouTube API metadata; transcript not ingested'): LearningConnectorResult {
  return {
    uri: item.url,
    title: item.title,
    text: clean(`${item.title}. ${item.description}. Channel: ${item.channelTitle}.`),
    observedAt: item.publishedAt,
    license,
  }
}

export function createYouTubeMetadataSearch(apiKey: string, fetcher: FetchLike = fetch): LearningConnectorSearch {
  const discover = createCachedYouTubeDiscovery(apiKey, fetcher)
  return async (query, limit) => (await discover(query, limit)).map(item => youtubeMetadataResult(item)).filter((item: LearningConnectorResult) => item.uri && item.text)
}

export type YouTubeTranscriptSearchOptions = {
  transcriptApiUrl: string
  transcriptApiToken?: string
  languages?: string[]
  metadataFallback?: boolean
}

/**
 * Discover each YouTube candidate once. The caller intentionally supplies a subject/domain query,
 * and this client caches that discovery for the lifetime of the learning cycle. Multiple questions
 * in the same domain therefore reuse one search.list call instead of exhausting YouTube's dedicated
 * search quota bucket. Each returned transcript is still scored against the individual question by
 * ContinuousLearningCycle before it can be admitted.
 *
 * When a transcript runtime is configured, the same discovery result is reused as a low-confidence
 * metadata pointer if captions are unavailable or the transcript service is temporarily unreachable.
 */
export function createYouTubeTranscriptSearch(apiKey: string, options: YouTubeTranscriptSearchOptions, fetcher: FetchLike = fetch): LearningConnectorSearch {
  const discover = createCachedYouTubeDiscovery(apiKey, fetcher)
  return async (query, limit) => {
    if (!apiKey || !options.transcriptApiUrl) return []
    const videos = await discover(query, limit)
    const results: LearningConnectorResult[] = []
    for (const video of videos) {
      let storedTranscript = false
      try {
        const response = await fetcher(options.transcriptApiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.transcriptApiToken ? { authorization: `Bearer ${options.transcriptApiToken}` } : {}),
          },
          body: JSON.stringify({
            videoId: video.videoId,
            videoUrl: video.url,
            languages: options.languages?.length ? options.languages : ['en'],
          }),
        })
        if (response.ok) {
          const payload = await response.json().catch(() => null)
          const transcript = transcriptText(payload)
          if (transcript) {
            results.push({
              uri: video.url,
              title: video.title,
              text: transcript,
              observedAt: video.publishedAt,
              license: clean(payload?.license || 'authorized transcript service supplied to COS'),
            })
            storedTranscript = true
          }
        }
      } catch {}
      if (!storedTranscript && options.metadataFallback) {
        const fallback = youtubeMetadataResult(video, 'YouTube API metadata; transcript unavailable')
        if (fallback.uri && fallback.text) results.push(fallback)
      }
    }
    return results.slice(0, Math.min(Math.max(limit, 1), 10))
  }
}

type GdeltCacheEntry = {
  expiresAt: number
  promise: Promise<LearningConnectorResult[]>
}

/**
 * GDELT is sensitive to long natural-language queries and public-endpoint bursts. Keep queries
 * compact, retry only twice with slower exponential/Retry-After-aware backoff, and reuse both
 * successful and failed identical searches for a bounded period. A throttled query therefore cannot
 * create a request storm while the per-source circuit breaker is deciding whether to open.
 */
export function createGdeltNewsSearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  const cache = new Map<string, GdeltCacheEntry>()
  return async (query, limit) => {
    const maxRecords = Math.min(Math.max(limit, 1), 10)
    const q = compactQuery(query, 6)
    const key = `${q.toLowerCase()}|${maxRecords}`
    const now = Date.now()
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now) return await cached.promise
    if (cached) cache.delete(key)

    const promise = (async () => {
      const data = await json(
        fetcher,
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${maxRecords}&format=json`,
        undefined,
        { attempts: 2, baseDelayMs: 1_000, maxDelayMs: 8_000 },
      )
      return (data?.articles ?? [])
        .map((article: any): LearningConnectorResult => ({
          uri: clean(article?.url),
          title: clean(article?.title),
          text: clean(`${article?.title ?? ''}. Source: ${article?.domain ?? ''}. Language: ${article?.language ?? ''}.`),
          observedAt: article?.seendate,
          license: 'news discovery metadata/provenance only',
        }))
        .filter((item: LearningConnectorResult) => item.uri && item.text)
    })()

    const entry: GdeltCacheEntry = { expiresAt: now + 30_000, promise }
    cache.set(key, entry)
    promise.then(
      () => { entry.expiresAt = Date.now() + 10 * 60_000 },
      error => {
        const retryAfter = error instanceof LearningSourceFetchError ? error.retryAfterMs : 0
        entry.expiresAt = Date.now() + Math.max(30_000, retryAfter)
      },
    )
    return await promise
  }
}

export function createAuthorizedTranscriptSearch(
  lookup: (query: string, limit: number) => Promise<Array<{ videoUrl: string; title?: string; transcript: string; observedAt?: string }>>,
): LearningConnectorSearch {
  return async (query, limit) => (await lookup(query, Math.min(Math.max(limit, 1), 10)))
    .filter(item => Boolean(item.videoUrl && item.transcript.trim()))
    .map((item): LearningConnectorResult => ({
      uri: item.videoUrl,
      title: clean(item.title),
      text: clean(item.transcript),
      observedAt: item.observedAt,
      license: 'authorized transcript supplied to COS',
    }))
}
