// POST /api/wikipedia
// Body: { query: string }
//
// Searches Wikipedia for the query, extracts title/description/image/link for
// the top results, saves them to the `items` Supabase table, and returns them.
//
// Wikipedia content is licensed under CC BY-SA 4.0.
// Attribution is required — it is included in every response from this route.
// License details: https://creativecommons.org/licenses/by-sa/4.0/

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WIKI_API   = 'https://en.wikipedia.org/w/api.php'
const RESULTS    = 10
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function searchPageIds(query: string): Promise<number[]> {
  const params = new URLSearchParams({
    action:   'query',
    list:     'search',
    srsearch: query,
    srlimit:  String(RESULTS),
    format:   'json',
  })
  const res = await fetch(`${WIKI_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Wikipedia search failed: ${res.status}`)
  const data = await res.json()
  return (data?.query?.search ?? []).map((r: { pageid: number }) => r.pageid)
}

async function fetchPageDetails(pageIds: number[]): Promise<WikiItem[]> {
  if (pageIds.length === 0) return []
  const params = new URLSearchParams({
    action:      'query',
    pageids:     pageIds.join('|'),
    prop:        'extracts|pageimages|info',
    exintro:     'true',
    explaintext: 'true',
    exsentences: '2',
    piprop:      'original',
    inprop:      'url',
    format:      'json',
  })
  const res = await fetch(`${WIKI_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Wikipedia page fetch failed: ${res.status}`)
  const data  = await res.json()
  const pages = Object.values(data?.query?.pages ?? {}) as WikiPage[]
  return pages.map(page => ({
    title:       page.title ?? '',
    description: page.extract?.trim() ?? null,
    image_url:   page.original?.source ?? null,
    wiki_url:    page.fullurl ?? `https://en.wikipedia.org/?curid=${page.pageid}`,
  }))
}

type WikiPage = {
  pageid:    number
  title?:    string
  extract?:  string
  original?: { source?: string }
  fullurl?:  string
}

type WikiItem = {
  title:       string
  description: string | null
  image_url:   string | null
  wiki_url:    string
}

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const query = (body?.query ?? '').trim()
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }
    const pageIds = await searchPageIds(query)
    if (pageIds.length === 0) {
      return NextResponse.json({
        items:       [],
        attribution: wikipediaAttribution(),
        message:     'No Wikipedia results found for that query.',
      })
    }
    const wikiItems = await fetchPageDetails(pageIds)
    const db   = supabase()
    const rows = wikiItems.map(item => ({
      query,
      title:       item.title,
      description: item.description,
      image_url:   item.image_url,
      wiki_url:    item.wiki_url,
      fetched_at:  new Date().toISOString(),
    }))
    const { data: saved, error: dbError } = await db
      .from('items')
      .upsert(rows, { onConflict: 'wiki_url' })
      .select()
    if (dbError) {
      console.error('Wikipedia route: DB upsert error', dbError)
      return NextResponse.json({
        items:       wikiItems,
        attribution: wikipediaAttribution(),
        warning:     'Results returned but could not be saved to database.',
      })
    }
    console.log(`Wikipedia route: saved ${saved?.length ?? 0} items for query "${query}"`)
    return NextResponse.json({
      items:       saved ?? wikiItems,
      attribution: wikipediaAttribution(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Wikipedia route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function wikipediaAttribution() {
  return {
    source:      'Wikipedia',
    license:     'CC BY-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    notice:      'Content retrieved from Wikipedia. Wikipedia® is a registered trademark of the Wikimedia Foundation. Content is available under the Creative Commons Attribution-ShareAlike 4.0 International License.',
  }
}
