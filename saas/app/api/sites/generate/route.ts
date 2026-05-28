// saas/app/api/sites/generate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

const TYPO_MAP: Record<string, string> = {
  restuarants: 'restaurants',
  musuem: 'museum',
  musuems: 'museums',
  univeristy: 'university',
  footbal: 'football',
  futebool: 'futebol',
  eqipes: 'equipes',
}

type Intent = 'site_design' | 'data_seeding' | 'data_fetching'
type ExtractedQuery = { query: string | null, confidence: number, intent: Intent, keywords: string[], normalizedText: string }

type WikiItem = { title: string, description: string, image_url: string | null, wiki_url: string }

type ImportHistoryRow = {
  source: 'wikipedia' | 'fallback-demo'
  query: string
  importedCount: number
  confidence: number
  timestamp: string
}

function normalizeInput(description: string): string {
  const cleaned = description
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
    .split(' ')
    .map((token) => TYPO_MAP[token] ?? token)
    .join(' ')
}

function extractKeywords(normalizedText: string): string[] {
  const buckets = [
    'team', 'teams', 'equipe', 'equipes', 'club', 'clubs',
    'football', 'futebol', 'soccer', 'amateur', 'varzea',
    'museum', 'museums', 'museu', 'museus',
    'restaurant', 'restaurants', 'restaurante', 'restaurantes',
    'university', 'universities', 'universidade', 'universidades',
    'sao paulo', 'rio de janeiro', 'brazil', 'brasil', 'world', 'mundo',
  ]

  return [...new Set(buckets.filter((k) => normalizedText.includes(k)))]
}

function classifyIntent(normalizedText: string): Intent {
  if (/\b(seed|demo|fake|populate|populate with|preencher|dados fake|dados demo)\b/.test(normalizedText)) return 'data_seeding'
  if (/\b(list|top|best|famous|show|fetch|get|wikipedia|listar|melhores|mais famosos|pegue|buscar)\b/.test(normalizedText)) return 'data_fetching'
  return 'site_design'
}

function buildDeterministicQuery(normalizedText: string, keywords: string[]): string | null {
  const hasMuseum = keywords.some((k) => ['museum', 'museums', 'museu', 'museus'].includes(k))
  if (hasMuseum && /\b(world|mundo)\b/.test(normalizedText)) return 'List of museums in the world Wikipedia'

  const hasTeam = keywords.some((k) => ['team', 'teams', 'equipe', 'equipes', 'club', 'clubs'].includes(k))
  const hasFootball = keywords.some((k) => ['football', 'futebol', 'soccer'].includes(k))
  const hasSaoPaulo = normalizedText.includes('sao paulo')
  if (hasTeam && hasFootball && hasSaoPaulo) return 'São Paulo amateur football teams Wikipedia'

  if (hasMuseum) return 'famous museums world Wikipedia'
  if (keywords.some((k) => ['restaurant', 'restaurants', 'restaurante', 'restaurantes'].includes(k))) return 'best restaurants Wikipedia'
  if (keywords.some((k) => ['university', 'universities', 'universidade', 'universidades'].includes(k))) return 'top universities Wikipedia'
  return null
}

async function extractWikipediaQuery(description: string): Promise<ExtractedQuery> {
  const normalizedText = normalizeInput(description)
  const keywords = extractKeywords(normalizedText)
  const intent = classifyIntent(normalizedText)
  const deterministicQuery = buildDeterministicQuery(normalizedText, keywords)

  let query = deterministicQuery
  let confidence = deterministicQuery ? 0.82 : 0.35

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: `You are an NLP query extraction engine.
Output STRICT JSON with fields:
- query: string | "NONE"
- confidence: number between 0 and 1
Use English query suitable for Wikipedia lookup.
Prioritize entities (teams, museums, restaurants, universities, landmarks).
If user intent is website-only with no real-world list need, return NONE.
No prose.`,
        messages: [{ role: 'user', content: description }],
      }),
    })
    if (response.ok) {
      const data = await response.json()
      const text = (data.content?.[0]?.text || '').trim()
      const firstBrace = text.indexOf('{')
      const lastBrace = text.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as { query?: string, confidence?: number }
        if (parsed.query && parsed.query.toUpperCase() !== 'NONE') query = parsed.query.trim()
        confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : confidence
      }
    }
  } catch {
    // keep deterministic fallback
  }

  if (!query && intent === 'data_fetching' && keywords.length > 0) {
    query = `${keywords.join(' ')} Wikipedia`
    confidence = Math.max(confidence, 0.55)
  }

  return { query, confidence, intent, keywords, normalizedText }
}

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function seedFallbackItems() {
  const db = supabaseAdmin()
  const makeRows = (count: number, prefix: string, category: string, city: string) =>
    Array.from({ length: count }, (_, i) => ({
      name: `${prefix} ${i + 1}`,
      description: `Demo ${category} entry ${i + 1} for ${city}.`,
      image_url: null,
      source_url: `https://example.com/demo/${category}/${i + 1}`,
      metadata: { seeded: true, source: 'fallback-demo', category },
    }))

  const rows = [
    ...makeRows(40, 'Equipe de Várzea', 'teams', 'São Paulo'),
    ...makeRows(20, 'Museu', 'museums', 'São Paulo'),
    ...makeRows(20, 'Restaurante', 'restaurants', 'São Paulo'),
    ...makeRows(20, 'Universidade', 'universities', 'São Paulo'),
  ]

  const { error } = await db.from('items').upsert(rows, { onConflict: 'source_url' })
  if (error) throw error
  return rows.length
}

async function saveWikipediaItems(query: string, wikiItems: WikiItem[]) {
  if (wikiItems.length === 0) return 0
  const db = supabaseAdmin()
  const rows = wikiItems.map((item) => ({
    name: item.title,
    description: item.description,
    image_url: item.image_url,
    source_url: item.wiki_url,
    metadata: { source: 'wikipedia', query, license: 'CC-BY-SA' },
  }))
  const { data, error } = await db.from('items').upsert(rows, { onConflict: 'source_url' }).select('id')
  if (error) throw error
  return data?.length ?? rows.length
}

async function fetchWikipediaItems(query: string): Promise<WikiItem[]> {
  try {
    const searchParams = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '20', format: 'json' })
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

    return pages
      .filter((p: any) => p.title && p.extract)
      .map((p: any) => ({
        title: p.title,
        description: (p.extract || '').trim().slice(0, 200),
        image_url: p.original?.source ?? null,
        wiki_url: p.fullurl ?? `https://en.wikipedia.org/?curid=${p.pageid}`,
      }))
  } catch (err) {
    console.error('Sites generate: Wikipedia fetch error', err)
    return []
  }
}

async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userContent }] }),
    })
    if (!response.ok) {
      console.error('Sites generate Anthropic:', response.status, await response.text())
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Sites generate Claude error', err)
    return null
  }
}

const DISPLAY_FONTS = ['Fraunces', 'Playfair Display', 'Bricolage Grotesque', 'Space Grotesk', 'Syne', 'Sora', 'DM Serif Display', 'Archivo', 'Unbounded']
const BODY_FONTS = ['DM Sans', 'Manrope', 'Work Sans', 'Outfit', 'Spline Sans', 'Newsreader', 'IBM Plex Sans']
const CONFIDENCE_THRESHOLD = 0.6

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.
LANGUAGE (CRITICAL): Detect user's language and keep visible copy in that language.
REAL-WORLD DATA (CRITICAL when provided): Use REAL_WORLD_DATA items exactly and include a gallery/feature-grid with those names.
OUTPUT FORMAT: valid JSON only with businessName, theme, fonts, palette, sections. Start with hero, end with contact.`

function isValidContent(p: any): boolean {
  return p && typeof p.businessName === 'string' && Array.isArray(p.sections) && p.sections.length > 0
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to generate a website.' }, { status: 401 })

    const body = await req.json()
    const description = body?.description
    if (!description || typeof description !== 'string' || description.trim().length < 4) {
      return NextResponse.json({ error: 'Please describe the website you want.' }, { status: 400 })
    }

    const trimmed = description.trim()
    let userMessage = trimmed
    let wikiItems: WikiItem[] = []
    const importHistory: ImportHistoryRow[] = []

    const extraction = await extractWikipediaQuery(trimmed)
    const wikiQuery = extraction.query
    const shouldFetch = wikiQuery && extraction.confidence >= CONFIDENCE_THRESHOLD

    console.log('Sites generate NLP:', extraction)

    if (shouldFetch) {
      wikiItems = await fetchWikipediaItems(wikiQuery)
      const saved = await saveWikipediaItems(wikiQuery, wikiItems)
      importHistory.push({ source: 'wikipedia', query: wikiQuery, importedCount: saved, confidence: extraction.confidence, timestamp: new Date().toISOString() })

      if (wikiItems.length > 0) {
        const itemList = wikiItems.slice(0, 20).map((item, i) => `${i + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}`).join('\n')
        userMessage = `${trimmed}\n\nREAL_WORLD_DATA (fetched from Wikipedia — use these real items in the site):\n${itemList}`
      }
    }

    if (!shouldFetch || wikiItems.length === 0) {
      const seededCount = await seedFallbackItems()
      importHistory.push({ source: 'fallback-demo', query: wikiQuery ?? 'NONE', importedCount: seededCount, confidence: extraction.confidence, timestamp: new Date().toISOString() })
    }

    const raw = await callClaude(SYSTEM_PROMPT, userMessage)
    if (!raw) return NextResponse.json({ error: 'I could not generate the website right now. Please try again.' }, { status: 502 })

    let parsed: any = null
    try {
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch { parsed = null }

    if (!isValidContent(parsed)) {
      return NextResponse.json({ error: 'The generated design was not valid. Please try again.' }, { status: 502 })
    }
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

    return NextResponse.json({
      content: parsed,
      wikiItems: wikiItems.length > 0 ? wikiItems : undefined,
      attribution: wikiItems.length > 0 ? 'Data from Wikipedia, licensed under CC-BY-SA.' : undefined,
      aiUnderstanding: {
        interpretedRequest: extraction.normalizedText,
        query: wikiQuery ?? 'NONE',
        confidence: extraction.confidence,
        intent: extraction.intent,
        keywords: extraction.keywords,
        usedFallback: !shouldFetch || wikiItems.length === 0,
        message: extraction.confidence < CONFIDENCE_THRESHOLD
          ? 'Low confidence extraction. Demo data was seeded so previews are never empty.'
          : `I interpreted your request as: ${wikiQuery ?? extraction.normalizedText}`,
      },
      sourceHistory: importHistory,
    })
  } catch (error) {
    console.error('Sites generate error', error)
    return NextResponse.json({ error: 'Something went wrong generating the website.' }, { status: 500 })
  }
}
