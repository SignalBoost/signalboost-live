import type { LearningConnectorResult, LearningConnectorSearch } from './connectors.ts'

type FetchLike = typeof fetch
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

function retryAfterMs(response: Response, attempt: number): number {
  const header = String(response.headers.get('retry-after') || '').trim()
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15_000, Math.max(250, Math.round(seconds * 1000)))
    const date = Date.parse(header)
    if (Number.isFinite(date)) return Math.min(15_000, Math.max(250, date - Date.now()))
  }
  return response.status === 429 ? 1500 * (attempt + 1) : 300 * (attempt + 1)
}

async function json(fetcher: FetchLike, url: string, init?: RequestInit): Promise<any> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    let waitMs = 0
    try {
      const response = await fetcher(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'SignalBoost-COS/1.0', ...(init?.headers ?? {}) },
      })
      if (!response.ok) {
        const error = new Error(`COS learning source failed: ${response.status}`)
        if (!TRANSIENT_STATUS.has(response.status)) throw error
        lastError = error
        waitMs = retryAfterMs(response, attempt)
      } else {
        return await response.json()
      }
    } catch (error) {
      lastError = error
      if (attempt >= 2) throw error
      if (!waitMs) waitMs = 300 * (attempt + 1)
    } finally {
      clearTimeout(timer)
    }
    if (attempt < 2 && waitMs) await delay(waitMs)
  }
  throw lastError instanceof Error ? lastError : new Error('COS learning source failed')
}

function clean(value: unknown): string { return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function compactQuery(query: string, maxTerms = 8): string { return clean(query).split(/\s+/).filter(Boolean).slice(0, maxTerms).join(' ') }
function transcriptText(payload: any): string {
  if (typeof payload?.transcript === 'string') return clean(payload.transcript)
  if (typeof payload?.text === 'string') return clean(payload.text)
  if (Array.isArray(payload?.segments)) return clean(payload.segments.map((segment: any) => segment?.text ?? '').join(' '))
  if (Array.isArray(payload?.transcript)) return clean(payload.transcript.map((segment: any) => segment?.text ?? segment ?? '').join(' '))
  return ''
}

type DiscoveredYouTubeVideo = { videoId:string; url:string; title:string; description:string; channelTitle:string; publishedAt:string }
async function discoverYouTubeVideos(apiKey: string, query: string, limit: number, fetcher: FetchLike): Promise<DiscoveredYouTubeVideo[]> {
  if (!apiKey) return []
  const maxResults = Math.min(Math.max(limit, 1), 10)
  const search = await json(fetcher, `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(compactQuery(query, 10))}&key=${encodeURIComponent(apiKey)}`)
  return (search?.items ?? []).map((item: any): DiscoveredYouTubeVideo => ({
    videoId: clean(item?.id?.videoId),
    url: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
    title: clean(item?.snippet?.title),
    description: clean(item?.snippet?.description),
    channelTitle: clean(item?.snippet?.channelTitle),
    publishedAt: clean(item?.snippet?.publishedAt),
  })).filter((item: DiscoveredYouTubeVideo) => Boolean(item.videoId && item.url))
}
function createCachedYouTubeDiscovery(apiKey: string, fetcher: FetchLike) {
  const cache = new Map<string, Promise<DiscoveredYouTubeVideo[]>>()
  return async (query: string, limit: number) => {
    const normalized = compactQuery(query, 10).toLowerCase(), bounded = Math.min(Math.max(limit, 1), 10), key = `${normalized}|${bounded}`
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
  return { uri:item.url, title:item.title, text:clean(`${item.title}. ${item.description}. Channel: ${item.channelTitle}.`), observedAt:item.publishedAt, license }
}
export function createYouTubeMetadataSearch(apiKey: string, fetcher: FetchLike = fetch): LearningConnectorSearch {
  const discover = createCachedYouTubeDiscovery(apiKey, fetcher)
  return async (query, limit) => (await discover(query, limit)).map(item => youtubeMetadataResult(item)).filter((item: LearningConnectorResult) => item.uri && item.text)
}
export type YouTubeTranscriptSearchOptions = { transcriptApiUrl:string; transcriptApiToken?:string; languages?:string[]; metadataFallback?:boolean }
export function createYouTubeTranscriptSearch(apiKey: string, options: YouTubeTranscriptSearchOptions, fetcher: FetchLike = fetch): LearningConnectorSearch {
  const discover = createCachedYouTubeDiscovery(apiKey, fetcher)
  return async (query, limit) => {
    if (!apiKey || !options.transcriptApiUrl) return []
    const videos = await discover(query, limit), results: LearningConnectorResult[] = []
    for (const video of videos) {
      let storedTranscript = false
      try {
        const response = await fetcher(options.transcriptApiUrl, { method:'POST', headers:{ 'content-type':'application/json', ...(options.transcriptApiToken ? { authorization:`Bearer ${options.transcriptApiToken}` } : {}) }, body:JSON.stringify({ videoId:video.videoId, videoUrl:video.url, languages:options.languages?.length ? options.languages : ['en'] }) })
        if (response.ok) {
          const payload = await response.json().catch(() => null), transcript = transcriptText(payload)
          if (transcript) { results.push({ uri:video.url, title:video.title, text:transcript, observedAt:video.publishedAt, license:clean(payload?.license || 'authorized transcript service supplied to COS') }); storedTranscript = true }
        }
      } catch {}
      if (!storedTranscript && options.metadataFallback) { const fallback = youtubeMetadataResult(video, 'YouTube API metadata; transcript unavailable'); if (fallback.uri && fallback.text) results.push(fallback) }
    }
    return results.slice(0, Math.min(Math.max(limit, 1), 10))
  }
}

/** GDELT is sensitive to long natural-language queries. Use compact topical terms and a
 * conservative record count; transient upstream failures are retried with Retry-After-aware
 * bounded backoff by json(). */
export function createGdeltNewsSearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const maxRecords = Math.min(Math.max(limit, 1), 10), q = compactQuery(query, 6)
    const data = await json(fetcher, `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${maxRecords}&format=json`)
    return (data?.articles ?? []).map((article: any): LearningConnectorResult => ({ uri:clean(article?.url), title:clean(article?.title), text:clean(`${article?.title ?? ''}. Source: ${article?.domain ?? ''}. Language: ${article?.language ?? ''}.`), observedAt:article?.seendate, license:'news discovery metadata/provenance only' })).filter((item: LearningConnectorResult) => item.uri && item.text)
  }
}
export function createAuthorizedTranscriptSearch(lookup: (query:string, limit:number) => Promise<Array<{videoUrl:string; title?:string; transcript:string; observedAt?:string}>>): LearningConnectorSearch {
  return async (query, limit) => (await lookup(query, Math.min(Math.max(limit, 1), 10))).filter(item => Boolean(item.videoUrl && item.transcript.trim())).map((item): LearningConnectorResult => ({ uri:item.videoUrl, title:clean(item.title), text:clean(item.transcript), observedAt:item.observedAt, license:'authorized transcript supplied to COS' }))
}
