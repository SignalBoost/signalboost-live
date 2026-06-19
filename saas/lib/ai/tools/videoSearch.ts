// saas/lib/ai/tools/videoSearch.ts
// AI tool wrapper around the existing video search (YouTube Data API v3 + Archive.org).
// It turns VERIFIED search results into media tags that the AssistantMessage renderer
// already understands: <VIDEO>youtube-id</VIDEO> or <VIDEO>archive-url</VIDEO>.
// This avoids exposing raw JSON arrays in the chat UI.

import { searchVideos, type VideoResult } from '@/lib/video/search'

export type AiVideoItem = {
  title: string
  type: 'video' | 'archive'
  id: string
  source: 'youtube' | 'archive'
  license: string
}

export type VideoSearchResult = {
  ok: boolean
  items: AiVideoItem[]
  array: string
  tags: string
  error?: string
}

function bareId(r: VideoResult): { type: 'video' | 'archive'; id: string } | null {
  if (r.source === 'youtube') {
    const id = (r.id || '').replace(/^yt-/, '')
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
    return { type: 'video', id }
  }

  if (r.source === 'archive') {
    const id = (r.id || '').replace(/^arc-/, '')
    if (!id) return null
    return { type: 'archive', id }
  }

  return null
}

function mediaTag(item: AiVideoItem): string {
  if (item.type === 'archive') {
    return `<VIDEO>https://archive.org/details/${item.id}</VIDEO>`
  }
  return `<VIDEO>${item.id}</VIDEO>`
}

export async function runVideoSearch(query: string): Promise<VideoSearchResult> {
  const q = String(query || '').trim().slice(0, 200)
  if (!q) return { ok: false, items: [], array: '', tags: '', error: 'Empty video search query.' }

  let results: VideoResult[] = []
  try {
    results = await searchVideos(q)
  } catch (err) {
    return { ok: false, items: [], array: '', tags: '', error: err instanceof Error ? err.message : 'Video search failed.' }
  }

  const items: AiVideoItem[] = []
  for (const r of results) {
    const mapped = bareId(r)
    if (!mapped) continue
    items.push({
      title: r.title || 'Untitled',
      type: mapped.type,
      id: mapped.id,
      source: r.source,
      license: r.licenseLabel || r.license,
    })
  }

  if (!items.length) {
    return {
      ok: false,
      items: [],
      array: '',
      tags: '',
      error: process.env.YOUTUBE_API_KEY
        ? 'No verified, embeddable videos were found for that query.'
        : 'No videos found. YouTube results require YOUTUBE_API_KEY in the environment; without it only Archive.org public-domain results are returned.',
    }
  }

  const array = JSON.stringify(items.map(i => ({ title: i.title, type: i.type, id: i.id })))
  const tags = items
    .map(i => `${i.title}\n${mediaTag(i)}`)
    .join('\n\n')

  return { ok: true, items, array, tags }
}

export function formatVideoSearchForAI(query: string, result: VideoSearchResult): string {
  if (!result.ok) {
    return `Video search for "${query}" returned nothing usable: ${result.error} Tell the user plainly and do NOT invent any video ids or links.`
  }

  const lines = result.items.map((i, n) => `${n + 1}. ${i.title} — ${i.source} (${i.license})`).join('\n')

  return [
    `Verified, embeddable results for "${query}":`,
    lines,
    '',
    'To display these videos inside SignalBoost, output EXACTLY the media blocks below. Do NOT output JSON. Do NOT wrap them in code fences. You may add one short sentence before them:',
    result.tags,
  ].join('\n')
}
