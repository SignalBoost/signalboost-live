import type { LearningConnectorResult, LearningConnectorSearch } from './connectors'

type FetchLike = typeof fetch

async function json(fetcher: FetchLike, url: string, init?: RequestInit): Promise<any> {
  const response = await fetcher(url, init)
  if (!response.ok) throw new Error(`COS learning source failed: ${response.status}`)
  return response.json()
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function transcriptText(payload: any): string {
  if (typeof payload?.transcript === 'string') return clean(payload.transcript)
  if (typeof payload?.text === 'string') return clean(payload.text)
  if (Array.isArray(payload?.segments)) {
    return clean(payload.segments.map((segment: any) => segment?.text ?? '').join(' '))
  }
  if (Array.isArray(payload?.transcript)) {
    return clean(payload.transcript.map((segment: any) => segment?.text ?? segment ?? '').join(' '))
  }
  return ''
}

async function discoverYouTubeVideos(apiKey: string, query: string, limit: number, fetcher: FetchLike) {
  if (!apiKey) return []
  const maxResults = Math.min(Math.max(limit, 1), 10)
  const search = await json(fetcher, `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`)
  return (search?.items ?? []).map((item: any) => ({
    videoId: clean(item?.id?.videoId),
    url: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
    title: clean(item?.snippet?.title),
    description: clean(item?.snippet?.description),
    channelTitle: clean(item?.snippet?.channelTitle),
    publishedAt: clean(item?.snippet?.publishedAt),
  })).filter((item: any) => item.videoId && item.url)
}

/**
 * YouTube Data API discovery client. Metadata remains a valid low-cost source when no
 * authorized transcript service has been configured.
 */
export function createYouTubeMetadataSearch(apiKey: string, fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const videos = await discoverYouTubeVideos(apiKey, query, limit, fetcher)
    return videos.map((item: any): LearningConnectorResult => ({
      uri: item.url,
      title: item.title,
      text: clean(`${item.title}. ${item.description}. Channel: ${item.channelTitle}.`),
      observedAt: item.publishedAt,
      license: 'YouTube API metadata; transcript not ingested',
    })).filter((item: LearningConnectorResult) => item.uri && item.text)
  }
}

export type YouTubeTranscriptSearchOptions = {
  transcriptApiUrl: string
  transcriptApiToken?: string
  languages?: string[]
}

/**
 * Automatic YouTube discovery + authorized transcript ingestion.
 *
 * COS first discovers relevant videos through the official YouTube Data API, then asks a
 * separately configured transcript service for transcript text. This avoids scraping
 * captions from YouTube while allowing customers to bind any authorized/managed transcript
 * provider behind a small provider-neutral contract.
 *
 * Transcript endpoint contract:
 *   POST <YOUTUBE_TRANSCRIPT_API_URL>
 *   { "videoId": "...", "videoUrl": "...", "languages": ["en", ...] }
 *
 * Accepted response shapes include { transcript: string }, { text: string }, or
 * { segments: [{ text: string }] }. Failed/missing transcripts are skipped safely.
 */
export function createYouTubeTranscriptSearch(
  apiKey: string,
  options: YouTubeTranscriptSearchOptions,
  fetcher: FetchLike = fetch,
): LearningConnectorSearch {
  return async (query, limit) => {
    if (!apiKey || !options.transcriptApiUrl) return []
    const videos = await discoverYouTubeVideos(apiKey, query, limit, fetcher)
    const results: LearningConnectorResult[] = []

    for (const video of videos) {
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
        if (!response.ok) continue
        const payload = await response.json().catch(() => null)
        const transcript = transcriptText(payload)
        if (!transcript) continue

        results.push({
          uri: video.url,
          title: video.title,
          text: transcript,
          observedAt: video.publishedAt,
          license: clean(payload?.license || 'authorized transcript service supplied to COS'),
        })
      } catch {
        // One unavailable transcript must not abort the entire learning acquisition cycle.
      }
    }

    return results.slice(0, Math.min(Math.max(limit, 1), 10))
  }
}

/**
 * GDELT DOC 2.0 news discovery. COS stores compact article evidence/provenance returned
 * by the discovery feed, not copies of publisher articles.
 */
export function createGdeltNewsSearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const maxRecords = Math.min(Math.max(limit, 1), 10)
    const data = await json(fetcher, `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${maxRecords}&format=json`)
    return (data?.articles ?? []).map((article: any): LearningConnectorResult => ({
      uri: clean(article?.url),
      title: clean(article?.title),
      text: clean(`${article?.title ?? ''}. Source: ${article?.domain ?? ''}. Language: ${article?.language ?? ''}.`),
      observedAt: article?.seendate,
      license: 'news discovery metadata/provenance only',
    })).filter((item: LearningConnectorResult) => item.uri && item.text)
  }
}

/** Authorized transcript results can be bound directly to the existing video_transcript adapter. */
export function createAuthorizedTranscriptSearch(
  lookup: (query: string, limit: number) => Promise<Array<{ videoUrl: string; title?: string; transcript: string; observedAt?: string }>>,
): LearningConnectorSearch {
  return async (query, limit) => (await lookup(query, Math.min(Math.max(limit, 1), 10)))
    .filter((item) => Boolean(item.videoUrl && item.transcript.trim()))
    .map((item): LearningConnectorResult => ({
      uri: item.videoUrl,
      title: clean(item.title),
      text: clean(item.transcript),
      observedAt: item.observedAt,
      license: 'authorized transcript supplied to COS',
    }))
}
