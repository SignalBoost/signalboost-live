// saas/app/api/sites/generate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ── Wikipedia enrichment ──────────────────────────────────────────────────────

const WIKI_API   = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

async function extractWikipediaQuery(description: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 30,
        system: `You decide if a website description needs real-world data from Wikipedia.

Reply with a short 2-5 word English Wikipedia search query IF the description mentions wanting a list of real-world things like:
- famous/best/top museums, churches, restaurants, hotels, beaches, landmarks, monuments, cities, teams, parks, castles, etc.
- specific real places or entities to feature on the site
- "populate with", "list of", "show the top", "add teams/items from"

Examples:
"build a site about the most famous museums in the world" → famous museums world
"site about beautiful churches" → beautiful churches world
"site listing top beaches in Brazil" → top beaches Brazil
"várzea football teams São Paulo" → varzea football teams Sao Paulo
"cozy Italian restaurant in São Paulo" → NONE
"my bakery needs a website" → NONE
"portfolio for a photographer" → NONE

Reply with ONLY the search query or NONE. No explanation.`,
        messages: [{ role: 'user', content: description }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json()
    const text = (data.content?.[0]?.text || '').trim()
    if (!text || text.toUpperCase() === 'NONE') return null
    return text
  } catch {
    return null
  }
}

function normalizeWikipediaQuery(description: string): string | null {
  const raw = description
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()

  const topicHints = [
    { pattern: /\b(team|teams|equipes?|clubes?)\b/, query: 'teams' },
    { pattern: /\b(football|futebol|soccer)\b/, query: 'football' },
    { pattern: /\b(amateur|varzea|várzea)\b/, query: 'amateur' },
    { pattern: /\b(museum|museums|museu|museus)\b/, query: 'museums' },
    { pattern: /\b(restaurant|restaurants|restaurante|restaurantes)\b/, query: 'restaurants' },
  ]

  const locationHints = ['sao paulo', 'são paulo', 'brazil', 'brasil', 'rio de janeiro', 'lisbon', 'new york', 'london']
  const topicParts = topicHints.filter(h => h.pattern.test(raw)).map(h => h.query)
  const location = locationHints.find(loc => raw.includes(loc))

  if (topicParts.length === 0) return null
  const queryParts = [location, ...new Set(topicParts), 'Wikipedia'].filter(Boolean)
  return queryParts.join(' ')
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function seedFallbackItems() {
  const db = supabaseAdmin()
  const makeRows = (count: number, prefix: string, category: string, city: string) =>
    Array.from({ length: count }, (_, i) => ({
      name: `${prefix} ${i + 1}`,
      description: `Demo ${category} entry ${i + 1} for ${city}.`,
      image_url: null,
      source_url: `https://example.com/demo/${category}/${i + 1}`,
      metadata: { seeded: true, source: 'fallback-demo' },
    }))

  const rows = [
    ...makeRows(40, 'Equipe de Várzea', 'teams', 'São Paulo'),
    ...makeRows(20, 'Museu', 'museums', 'São Paulo'),
    ...makeRows(20, 'Restaurante', 'restaurants', 'São Paulo'),
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

type WikiItem = {
  title:       string
  description: string
  image_url:   string | null
  wiki_url:    string
}

async function fetchWikipediaItems(query: string): Promise<WikiItem[]> {
  try {
    const searchParams = new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      srlimit: '8', format: 'json',
    })
    const searchRes = await fetch(`${WIKI_API}?${searchParams}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const pageIds: number[] = (searchData?.query?.search ?? []).map((r: any) => r.pageid)
    if (pageIds.length === 0) return []

    const detailParams = new URLSearchParams({
      action: 'query', pageids: pageIds.join('|'),
      prop: 'extracts|pageimages|info',
      exintro: 'true', explaintext: 'true', exsentences: '2',
      piprop: 'original', inprop: 'url', format: 'json',
    })
    const detailRes = await fetch(`${WIKI_API}?${detailParams}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!detailRes.ok) return []
    const detailData = await detailRes.json()
    const pages = Object.values(detailData?.query?.pages ?? {}) as any[]

    return pages
      .filter((p: any) => p.title && p.extract)
      .map((p: any) => ({
        title:       p.title,
        description: (p.extract || '').trim().slice(0, 200),
        image_url:   p.original?.source ?? null,
        wiki_url:    p.fullurl ?? `https://en.wikipedia.org/?curid=${p.pageid}`,
      }))
  } catch (err) {
    console.error('Sites generate: Wikipedia fetch error', err)
    return []
  }
}

// ── Claude site generation ────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
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
const BODY_FONTS    = ['DM Sans', 'Manrope', 'Work Sans', 'Outfit', 'Spline Sans', 'Newsreader', 'IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL):
- Detect the language the user wrote in and write EVERY visible text value in that same language (Brazilian Portuguese, Spanish, Polish, Russian, or English).

REAL-WORLD DATA (CRITICAL when provided):
- If the user message includes a REAL_WORLD_DATA block, you MUST use those real items to populate the site sections.
- Use the actual names and descriptions of those real places/things in your section content.
- Do NOT invent fictional items when real ones are provided.
- Include a gallery or feature-grid section that showcases each real item by name.

DESIGN LIKE A SENIOR DESIGNER:
- Commit to a BOLD, cohesive aesthetic that fits THIS specific business.
- Choose theme intentionally: "dark" for dramatic, premium, tech, creative; "light" for clean, friendly, food, services.
- Pick a distinctive FONT PAIRING. Display font from: ${DISPLAY_FONTS.join(', ')}. Body font from: ${BODY_FONTS.join(', ')}.
- Choose a cohesive PALETTE with a dominant color and sharp accent (hex values).
- Compose a RICH, VARIED page: strong hero, deliberate sequence of sections.

SECTION TYPES (compose 5-8 sections):
- "hero": eyebrow, heading, subheading, cta, ctaSecondary.
- "hero-split": eyebrow, heading, subheading, body, cta, ctaSecondary.
- "feature-grid": eyebrow, heading, subheading, items[] each {icon, title, body}.
- "stats": heading, stats[] each {value, label}.
- "gallery": heading, items[] each {title}.
- "video": eyebrow, heading, subheading, videoUrl (leave as "").
- "testimonials": heading, testimonials[] each {quote, author, role}.
- "cta": heading, subheading, cta.
- "contact": eyebrow, heading, body, email, phone, address.
- "about" / "text": eyebrow, heading, body.

OUTPUT FORMAT (STRICT — valid JSON only, no markdown):
{
  "businessName": "string",
  "theme": "light" | "dark",
  "fonts": { "display": "...", "body": "..." },
  "palette": { "primary": "#xxxxxx", "accent": "#xxxxxx", "background": "#xxxxxx", "surface": "#xxxxxx", "text": "#xxxxxx", "muted": "#xxxxxx" },
  "sections": [...]
}

RULES: Valid JSON only. Real specific copy. 5-8 sections. Start with hero, end with contact.`

function isValidContent(p: any): boolean {
  return p && typeof p.businessName === 'string' && Array.isArray(p.sections) && p.sections.length > 0
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to generate a website.' }, { status: 401 })
    }

    const body        = await req.json()
    const description = body?.description
    if (!description || typeof description !== 'string' || description.trim().length < 4) {
      return NextResponse.json({ error: 'Please describe the website you want.' }, { status: 400 })
    }

    const trimmed = description.trim()

    // ── Step 1: Extract Wikipedia query via Haiku ─────────────────────────
    let userMessage = trimmed
    let wikiItems:  WikiItem[] = []

    const extractedQuery = await extractWikipediaQuery(trimmed)
    const wikiQuery = extractedQuery ?? normalizeWikipediaQuery(trimmed)
    console.log('Sites generate: Wikipedia query extracted:', wikiQuery ?? 'NONE')

    if (wikiQuery) {
      wikiItems = await fetchWikipediaItems(wikiQuery)
      console.log(`Sites generate: fetched ${wikiItems.length} Wikipedia items for "${wikiQuery}"`)
      const saved = await saveWikipediaItems(wikiQuery, wikiItems)
      console.log(`Sites generate: saved ${saved} Wikipedia items to Items table`)

      if (wikiItems.length > 0) {
        const itemList = wikiItems
          .slice(0, 8)
          .map((item, i) => `${i + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}`)
          .join('\n')

        userMessage =
          `${trimmed}\n\n` +
          `REAL_WORLD_DATA (fetched from Wikipedia — use these real items in the site):\n` +
          `${itemList}\n\n` +
          `IMPORTANT: Include a gallery or feature-grid section listing these real items by name. ` +
          `Use their actual descriptions. Do not invent fictional alternatives.`
      }
    } else {
      const seededCount = await seedFallbackItems()
      console.log(`Sites generate: query=NONE, seeded ${seededCount} demo items`)
    }

    // ── Step 2: Generate site with Claude Sonnet ──────────────────────────
    const raw = await callClaude(SYSTEM_PROMPT, userMessage)
    if (!raw) {
      return NextResponse.json(
        { error: 'I could not generate the website right now. Please try again.' },
        { status: 502 },
      )
    }

    let parsed: any = null
    try {
      const firstBrace = raw.indexOf('{')
      const lastBrace  = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      }
    } catch {
      parsed = null
    }

    if (!isValidContent(parsed)) {
      return NextResponse.json(
        { error: 'The generated design was not valid. Please try again.' },
        { status: 502 },
      )
    }

    if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

    return NextResponse.json({
      content:   parsed,
      wikiItems: wikiItems.length > 0 ? wikiItems : undefined,
      attribution: wikiItems.length > 0 ? 'Data from Wikipedia, licensed under CC-BY-SA.' : undefined,
    })
  } catch (error) {
    console.error('Sites generate error', error)
    return NextResponse.json(
      { error: 'Something went wrong generating the website.' },
      { status: 500 },
    )
  }
}
