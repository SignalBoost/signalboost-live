// saas/app/api/sites/generate/route.ts
//
// Routing logic:
//   LOCAL  → /api/items/generate (Claude internal knowledge — local teams, restaurants, etc.)
//   GLOBAL → Wikipedia (famous museums, world churches, etc.)
//   NONE   → plain business/creative site, no data enrichment

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildFallbackItems,
  promptPreprocessor,
  validateItems,
  PROMPT_PREPROCESSOR_CONFIDENCE_THRESHOLD,
  type ValidatedItem,
} from '@/lib/ai/promptPreprocessor'
import { routeDataRequest, type GeneratedItem } from '@/lib/ai/localKnowledge'

export const dynamic = 'force-dynamic'

const WIKI_API   = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

type WikiItem = { title: string; description: string; image_url: string | null; wiki_url: string }

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ── DB saves — always non-blocking ────────────────────────────────────────────
async function saveValidatedItems(items: ValidatedItem[]): Promise<number> {
  if (items.length === 0) return 0
  try {
    const db = supabaseAdmin()
    const { data, error } = await db.from('items').upsert(items, { onConflict: 'source_url' }).select('id')
    if (error) { console.error('Sites generate: DB save failed:', error.message); return 0 }
    return data?.length ?? items.length
  } catch (err) { console.error('Sites generate: DB save exception:', err); return 0 }
}

async function saveWikipediaItems(query: string, wikiItems: WikiItem[]): Promise<number> {
  const { items, skippedRows } = validateItems(
    wikiItems.map(item => ({
      name:        item.title,
      description: item.description,
      image_url:   item.image_url,
      source_url:  item.wiki_url,
      metadata:    { source: 'wikipedia', query, license: 'CC-BY-SA' },
    })),
    query,
  )
  skippedRows.forEach(row => console.warn('Sites generate: skipped Wikipedia row', row))
  return saveValidatedItems(items)
}

async function seedFallbackItems(query: string | null): Promise<number> {
  return saveValidatedItems(buildFallbackItems(query, 30))
}

// ── Wikipedia fetch ───────────────────────────────────────────────────────────
async function fetchWikipediaItems(query: string): Promise<WikiItem[]> {
  try {
    const searchParams = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '12', format: 'json' })
    const searchRes = await fetch(`${WIKI_API}?${searchParams}`, { headers: { 'User-Agent': USER_AGENT } })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const pageIds: number[] = (searchData?.query?.search ?? []).map((r: any) => r.pageid)
    if (pageIds.length === 0) return []
    const detailParams = new URLSearchParams({
      action: 'query', pageids: pageIds.join('|'), prop: 'extracts|pageimages|info',
      exintro: 'true', explaintext: 'true', exsentences: '2', piprop: 'original', inprop: 'url', format: 'json',
    })
    const detailRes = await fetch(`${WIKI_API}?${detailParams}`, { headers: { 'User-Agent': USER_AGENT } })
    if (!detailRes.ok) return []
    const detailData = await detailRes.json()
    const pages = Object.values(detailData?.query?.pages ?? {}) as any[]
    return pages.filter((p: any) => p.title && p.extract).map((p: any) => ({
      title:       p.title,
      description: (p.extract || '').trim().slice(0, 200),
      image_url:   p.original?.source ?? null,
      wiki_url:    p.fullurl ?? `https://en.wikipedia.org/?curid=${p.pageid}`,
    }))
  } catch (err) { console.error('Sites generate: Wikipedia fetch error', err); return [] }
}

// ── Local knowledge fetch — calls /api/items/generate internally ──────────────
async function fetchLocalKnowledgeItems(
  userPrompt: string,
  category:   string,
  language:   string,
): Promise<GeneratedItem[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com'
    const res = await fetch(`${baseUrl}/api/items/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userPrompt, category, language, count: 20 }),
    })
    if (!res.ok) {
      console.error('Sites generate: local knowledge fetch failed', res.status, await res.text())
      return []
    }
    const data = await res.json()
    console.log('Sites generate: local knowledge items fetched', {
      count:    data.count,
      saved:    data.saved,
      category: data.category,
      duration: data.duration,
    })
    return data.items ?? []
  } catch (err) {
    console.error('Sites generate: local knowledge fetch exception', err)
    return []
  }
}
