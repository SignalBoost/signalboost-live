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

/**
 * YouTube Data API discovery client. This deliberately learns from video metadata and
 * descriptions only. Transcript text must be supplied by an authorized transcript API
 * or by content the customer owns/has rights to; COS does not scrape YouTube captions.
 */
export function createYouTubeMetadataSearch(apiKey: string, fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    if (!apiKey) return []
    const maxResults = Math.min(Math.max(limit, 1), 10)
    const search = await json(fetcher, `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`)
    return (search?.items ?? []).map((item: any): LearningConnectorResult => ({
      uri: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
      title: clean(item?.snippet?.title),
      text: clean(`${item?.snippet?.title ?? ''}. ${item?.snippet?.description ?? ''}. Channel: ${item?.snippet?.channelTitle ?? ''}.`),
      observedAt: item?.snippet?.publishedAt,
      license: 'YouTube API metadata; transcript not ingested',
    })).filter((item: LearningConnectorResult) => item.uri && item.text)
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

/** Authorized transcript results can be bound to the existing video_transcript adapter. */
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
