// saas/app/api/sites/generate/route.ts
// Generates a REAL, fully-designed website from a user's description using Claude.
// Automatically fetches real-world content from Wikipedia when the request is
// about real-world topics (museums, churches, restaurants, teams, etc.) and
// injects it into the prompt so Claude populates sections with actual data.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

// ── Wikipedia enrichment ──────────────────────────────────────────────────────

const WIKI_API   = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

const REAL_WORLD_KEYWORDS = [
  'churches', 'church', 'igrejas', 'iglesias', 'kościoły', 'церкви',
  'museums', 'museum', 'museus', 'museos', 'muzea', 'музеи',
  'restaurants', 'restaurant', 'restaurantes',
  'hotels', 'hotel', 'hotéis', 'hoteles',
  'beaches', 'beach', 'praias', 'playas', 'plaże', 'пляжи',
  'landmarks', 'monuments', 'monument',
  'teams', 'team', 'times', 'equipos', 'drużyny', 'команды',
  'cities', 'city', 'cidades', 'ciudades', 'города',
  'parks', 'park', 'parques',
  'universities', 'university', 'universidades',
  'mountains', 'waterfalls', 'lakes', 'rivers',
  'buildings', 'skyscrapers', 'castles', 'castle',
  'artists', 'scientists', 'inventors', 'players',
]

const CONTENT_INTENT_KEYWORDS = [
  'best', 'top', 'most', 'famous', 'beautiful', 'greatest', 'list',
  'world', 'global', 'all', 'popular', 'known', 'historic', 'ancient',
  'melhores', 'mais', 'famosas', 'mundiais',
  'mejores', 'más', 'famosas', 'mundiales',
  'najlepsze', 'słynne', 'światowe',
  'лучшие', 'известные', 'мировые',
]

function detectsRealWorldContent(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    REAL_WORLD_KEYWORDS.some(kw => lower.includes(kw)) &&
    CONTENT_INTENT_KEYWORDS.some(kw => lower.includes(kw))
  )
}

function extractSearchQuery(text: string): string {
  const cleaned = text
    .replace(/build\s+(me\s+)?a\s+(website|site|page)\s+(about|on|for|with|showing|listing|featuring)?/gi, '')
    .replace(/create\s+(me\s+)?a\s+(website|site|page)\s+(about|on|for|with|showing|listing|featuring)?/gi, '')
    .replace(/make\s+(me\s+)?a\s+(website|site|page)\s+(about|on|for|with)?/gi, '')
    .replace(/quero\s+(um\s+)?site\s+(sobre|com|de)?/gi, '')
    .replace(/criar?\s+(um\s+)?site\s+(sobre|com|de)?/gi, '')
    .replace(/crea[r]?\s+(un\s+)?sitio\s+(sobre|con|de)?/gi, '')
    .replace(/and\s+(put|add|save|store|insert)\s+(it|them)?\s+(in|into|to)\s+(the\s+)?(database|db|supabase).*/gi, '')
    .replace(/coloque\s+(no|na)\s+banco\s+de\s+dados.*/gi, '')
    .replace(/inclua\s+(no|na)\s+banco\s+de\s+dados.*/gi, '')
    .trim()
  return cleaned.length > 5 ? cleaned : text.trim()
}

type WikiItem = {
  title: string
  description: string
  image_url: string | null
  wiki_url: string
}

async function fetchWikipediaItems(query: string): Promise<WikiItem[]> {
  try {
    // Search
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

    // Details
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

// ── Claude call ───────────────────────────────────────────────────────────────

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
      const errorBody = await response.text()
      console.error('Sites generate Anthropic:', response.status, errorBody)
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Sites generate Claude error', err)
    return null
  }
}

// ── Design system ─────────────────────────────────────────────────────────────

const DISPLAY_FONTS = ['Fraunces', 'Playfair Display', 'Bricolage Grotesque', 'Space Grotesk', 'Syne', 'Sora', 'DM Serif Display', 'Archivo', 'Unbounded']
const BODY_FONTS    = ['DM Sans', 'Manrope', 'Work Sans', 'Outfit', 'Spline Sans', 'Newsreader', 'IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL):
- Detect the language the user wrote in and write EVERY visible text value in that same language (Brazilian Portuguese, Spanish, Polish, Russian, or English).

REAL-WORLD DATA (CRITICAL when provided):
- If the user message includes a REAL_WORLD_DATA block, you MUST use those real items to populate the site sections.
- Use the actual names, descriptions, and details of those real places/things in your section content.
- Do NOT invent fictional items when real ones are provided. A gallery section should list the actual real items by name.
- Include a gallery or feature-grid section that showcases each real item by name.

DESIGN LIKE A SENIOR DESIGNER (no generic "AI slop"):
- Commit to a BOLD, cohesive aesthetic that fits THIS specific business. A nightclub, a law firm, a bakery, and a fintech app must each look clearly different.
- Choose theme intentionally: "dark" for dramatic, premium, nightlife, tech, creative brands; "light" for clean, friendly, wellness, food, professional services. Decide per business.
- Pick a distinctive FONT PAIRING. Display font from: ${DISPLAY_FONTS.join(', ')}. Body font from: ${BODY_FONTS.join(', ')}. Pair a characterful display with a clean body. Vary your choices between businesses — do not always pick the same fonts.
- Choose a cohesive PALETTE with a dominant color and a sharp accent (hex values). Dark themes need a deep background (e.g. #0a0a12) and luminous accents; light themes need a clean background and confident color. Avoid cliché purple-on-white.
- Compose a RICH, VARIED page: a strong hero, then a deliberate sequence of sections. Use MULTIPLE heroes when it fits, and mix section types for visual rhythm. A flat list of plain text blocks is a failure.

SECTION TYPES YOU CAN USE (compose 5-8 sections in a deliberate order):
- "hero": full-bleed atmospheric hero. Fields: eyebrow, heading, subheading, cta, ctaSecondary.
- "hero-split": hero with a side panel. Same fields + body (shown in the side panel).
- "feature-grid": fields: eyebrow, heading, subheading, items[] each {icon (1 emoji), title, body}. Use 3-6 items.
- "stats": fields: heading (optional), stats[] each {value, label}. Use 3-4 punchy stats.
- "gallery": fields: heading, items[] each {title}. Use 3-6 tiles.
- "video": fields: eyebrow, heading, subheading, videoUrl (leave videoUrl as "" — the platform fills it).
- "testimonials": fields: heading, testimonials[] each {quote, author, role}. Use 2-3.
- "cta": a bold call-to-action band. Fields: heading, subheading, cta.
- "contact": fields: eyebrow, heading, body, email, phone, address. Invent plausible contact details if none given.
- "about" / "text": fields: eyebrow, heading, body. A rich paragraph.

OUTPUT FORMAT (STRICT):
Return ONLY valid JSON — no markdown, no backticks, no text before or after. Exactly this shape:
{
  "businessName": "string",
  "theme": "light" | "dark",
  "fonts": { "display": "one of the display fonts", "body": "one of the body fonts" },
  "palette": { "primary": "#xxxxxx", "accent": "#xxxxxx", "background": "#xxxxxx", "surface": "#xxxxxx or rgba", "text": "#xxxxxx", "muted": "#xxxxxx or rgba" },
  "sections": [ { "type": "hero", "eyebrow": "...", "heading": "...", "subheading": "...", "cta": "...", "ctaSecondary": "..." }, ...more sections... ]
}

RULES:
- Valid JSON only: double quotes, hex colors start with #, no trailing commas.
- Real, specific, professional copy — never placeholder text, never lorem ipsum, never "[your text]".
- 5 to 8 sections, always starting with a hero and ending with a contact (and usually a cta before contact).
- Pick fonts and palette that genuinely fit the business; vary them across different businesses.
- Keep copy concise and natural in the user's language.`

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

    // ── Auto-enrich with Wikipedia if request is about real-world content ────
    let userMessage = trimmed
    let wikiItems: WikiItem[] = []

    if (detectsRealWorldContent(trimmed)) {
      const query = extractSearchQuery(trimmed)
      console.log('Sites generate: real-world content detected, fetching Wikipedia for:', query)
      wikiItems = await fetchWikipediaItems(query)

      if (wikiItems.length > 0) {
        const itemList = wikiItems
          .slice(0, 8)
          .map((item, i) =>
            `${i + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}`,
          )
          .join('\n')

        userMessage =
          `${trimmed}\n\n` +
          `REAL_WORLD_DATA (fetched from Wikipedia — use these real items to populate the site):\n` +
          `${itemList}\n\n` +
          `IMPORTANT: Build a gallery or feature-grid section that lists these real items by name. ` +
          `Use their actual descriptions in the section copy. Do not invent fictional alternatives.`

        console.log(`Sites generate: injecting ${wikiItems.length} Wikipedia items into prompt`)
      }
    }

    // ── Call Claude with enriched prompt ─────────────────────────────────────
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
      // Surface the enrichment data to the client for display/storage if needed
      wikiItems: wikiItems.length > 0 ? wikiItems : undefined,
    })
  } catch (error) {
    console.error('Sites generate error', error)
    return NextResponse.json(
      { error: 'Something went wrong generating the website.' },
      { status: 500 },
    )
  }
}
