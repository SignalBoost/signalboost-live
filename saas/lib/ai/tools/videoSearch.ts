// saas/lib/ai/tools/videoSearch.ts
// AI tool wrapper around the existing video search (YouTube Data API v3 + Archive.org).
// It turns VERIFIED search results into the EXACT canvas array that the
// AssistantMessage renderer understands: [{ "title", "type", "id" }] where type
// is "video" (YouTube) or "archive" (Archive.org). This is what lets the Chief of
// Staff / Concierge return playable embeds instead of prose/URLs — it never
// invents ids, it only forwards verified ones the canvas can embed.

import { searchVideos, type VideoResult } from '@/lib/video/search'

export type AiVideoItem = {
  title: string
  type: 'video' | 'archive'
  id: string // bare 11-char YouTube id, or Archive.org identifier
  source: 'youtube' | 'archive'
  license: string
}

export type VideoSearchResult = {
  ok: boolean
  items: AiVideoItem[]
  array: string
  error?: string
}

// The Lab search prefixes ids ("yt-<id>" / "arc-<identifier>"); strip down to the
// bare id the canvas embeds from, and reject anything malformed.
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

export async function runVideoSearch(query: string): Promise<VideoSearchResult> {
  const q = String(query || '').trim().slice(0, 200)
  if (!q) return { ok: false, items: [], array: '', error: 'Empty video search query.' }

  let results: VideoResult[] = []
  try {
    results = await searchVideos(q)
  } catch (err) {
    return { ok: false, items: [], array: '', error: err instanceof Error ? err.message : 'Video search failed.' }
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
      error: process.env.YOUTUBE_API_KEY
        ? 'No verified, embeddable videos were found for that query.'
        : 'No videos found. YouTube results require YOUTUBE_API_KEY in the environment; without it only Archive.org public-domain results are returned.',
    }
  }

  // Pre-build the EXACT array the canvas renders, so the model only echoes it.
  const array = JSON.stringify(items.map(i => ({ title: i.title, type: i.type, id: i.id })))
  return { ok: true, items, array }
}

// What the model receives back: the finished array plus an instruction to output
// it verbatim. No invented ids, no embed HTML, no external "click here" links.
export function formatVideoSearchForAI(query: string, result: VideoSearchResult): string {
  if (!result.ok) {
    return `Video search for "${query}" returned nothing usable: ${result.error} Tell the user plainly and do NOT invent any video ids or links.`
  }
  const lines = result.items.map((i, n) => `${n + 1}. ${i.title} — ${i.source} (${i.license})`).join('\n')
  return [
    `Verified, embeddable results for "${query}":`,
    lines,
    '',
    'To display these, output EXACTLY this JSON array on its own line (you may add one short sentence of context before it) and NOTHING else around it. Do NOT change the ids, do NOT add embed code or thumbnails — the canvas builds the players:',
    result.array,
  ].join('\n')
}
