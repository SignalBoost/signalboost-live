// saas/lib/video/search.ts
// Video search — YouTube Data API v3 + Archive.org
// Returns ranked, license-tagged results ready for the Lab UI.

export type VideoLicense = 'public' | 'embeddable' | 'restricted'

export type VideoResult = {
  id: string
  title: string
  description: string
  duration: string        // human-readable e.g. "4:32"
  durationSeconds: number
  thumbnail: string
  embedUrl: string
  watchUrl: string
  source: 'youtube' | 'archive'
  license: VideoLicense
  licenseLabel: string
  channelName?: string
  viewCount?: number
  publishedAt?: string
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function searchYouTube(query: string, maxResults = 8): Promise<VideoResult[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.warn('YOUTUBE_API_KEY not set — skipping YouTube search')
    return []
  }

  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('q', query)
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('videoEmbeddable', 'true')
  searchUrl.searchParams.set('maxResults', String(maxResults))
  searchUrl.searchParams.set('key', key)

  const res = await fetch(searchUrl.toString())
  if (!res.ok) {
    console.error('YouTube search failed:', res.status, await res.text())
    return []
  }

  const data = await res.json()
  const items: any[] = data.items ?? []
  if (!items.length) return []

  const videoIds = items.map((i: any) => i.id.videoId).join(',')
  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  detailsUrl.searchParams.set('part', 'contentDetails,statistics,status')
  detailsUrl.searchParams.set('id', videoIds)
  detailsUrl.searchParams.set('key', key)

  const detailsRes = await fetch(detailsUrl.toString())
  const detailsData = detailsRes.ok ? await detailsRes.json() : { items: [] }
  const detailsMap: Record<string, any> = {}
  for (const d of detailsData.items ?? []) {
    detailsMap[d.id] = d
  }

  return items.map((item: any) => {
    const videoId = item.id.videoId
    const snippet = item.snippet
    const details = detailsMap[videoId]
    const status = details?.status ?? {}
    const stats = details?.statistics ?? {}
    const rawDuration = details?.contentDetails?.duration ?? 'PT0S'

    const embeddable = status.embeddable !== false
    const license: VideoLicense = embeddable ? 'embeddable' : 'restricted'

    return {
      id: `yt-${videoId}`,
      title: snippet.title ?? '',
      description: (snippet.description ?? '').slice(0, 200),
      duration: parseDuration(rawDuration),
      durationSeconds: parseDurationSeconds(rawDuration),
      thumbnail: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? '',
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'youtube' as const,
      license,
      licenseLabel: embeddable ? 'Freely embeddable' : 'Rights-restricted',
      channelName: snippet.channelTitle ?? '',
      viewCount: parseInt(stats.viewCount ?? '0', 10),
      publishedAt: snippet.publishedAt ?? '',
    }
  })
}

// ── Archive.org ───────────────────────────────────────────────────────────────

async function searchArchive(query: string, maxResults = 4): Promise<VideoResult[]> {
  const url = new URL('https://archive.org/advancedsearch.php')
  url.searchParams.set('q', `${query} AND mediatype:(movies OR video)`)
  url.searchParams.set('fl[]', 'identifier,title,description,date,runtime,subject,downloads')
  url.searchParams.set('sort[]', 'downloads desc')
  url.searchParams.set('rows', String(maxResults))
  url.searchParams.set('page', '1')
  url.searchParams.set('output', 'json')

  const res = await fetch(url.toString())
  if (!res.ok) return []

  const data = await res.json()
  const docs: any[] = data.response?.docs ?? []

  return docs.map((doc: any) => {
    const id = doc.identifier ?? ''
    const runtime = doc.runtime ?? ''
    return {
      id: `arc-${id}`,
      title: doc.title ?? id,
      description: (doc.description ?? '').replace(/<[^>]+>/g, '').slice(0, 200),
      duration: runtime || 'Unknown',
      durationSeconds: 0,
      thumbnail: `https://archive.org/services/img/${id}`,
      embedUrl: `https://archive.org/embed/${id}`,
      watchUrl: `https://archive.org/details/${id}`,
      source: 'archive' as const,
      license: 'public' as const,
      licenseLabel: 'Public domain',
      publishedAt: doc.date ?? '',
    }
  })
}

// ── Combined search ───────────────────────────────────────────────────────────

export async function searchVideos(query: string): Promise<VideoResult[]> {
  const [ytResults, archiveResults] = await Promise.allSettled([
    searchYouTube(query, 8),
    searchArchive(query, 4),
  ])

  const yt = ytResults.status === 'fulfilled' ? ytResults.value : []
  const arc = archiveResults.status === 'fulfilled' ? archiveResults.value : []

  // Interleave: public domain first, then embeddable, then restricted last
  const publicDomain = [...arc, ...yt.filter(r => r.license === 'public')]
  const embeddable = yt.filter(r => r.license === 'embeddable')
  const restricted = yt.filter(r => r.license === 'restricted')

  return [...publicDomain, ...embeddable, ...restricted].slice(0, 10)
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function parseDurationSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = parseInt(match[1] ?? '0')
  const m = parseInt(match[2] ?? '0')
  const s = parseInt(match[3] ?? '0')
  return h * 3600 + m * 60 + s
}

function parseDuration(iso: string): string {
  const secs = parseDurationSeconds(iso)
  if (secs === 0) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
