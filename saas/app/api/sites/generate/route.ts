// saas/app/api/sites/generate/route.ts
//
// Streaming + two-layer cache:
//   Layer 1 — Site design cache: exact prompt match → return cached site (~3 sec)
//   Layer 2 — Local items cache: same category/city → skip team generation (~15 sec)
//   Layer 3 — Full generation: Haiku for site design + Sonnet for local knowledge

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildFallbackItems,
  promptPreprocessor,
  validateItems,
  type ValidatedItem,
} from '@/lib/ai/promptPreprocessor'
import { routeDataRequest } from '@/lib/ai/localKnowledge'
import { runLocalKnowledgeMode, type ValidLocalItem } from '@/lib/ai/modes'
import {
  getCachedLocalItems,
  getSiteDesignCache,
  saveLocalItems,
  saveSiteDesign,
} from '@/lib/ai/memory'

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

// ── Site design via Claude Haiku (fast) ───────────────────────────────────────
async function callHaiku(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // Fast model for site design
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    })
    if (!response.ok) {
      console.error('Sites generate Haiku error:', response.status, await response.text())
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Sites generate Haiku exception', err)
    return null
  }
}

const DISPLAY_FONTS = ['Fraunces','Playfair Display','Bricolage Grotesque','Space Grotesk','Syne','Sora','DM Serif Display','Archivo','Unbounded']
const BODY_FONTS    = ['DM Sans','Manrope','Work Sans','Outfit','Spline Sans','Newsreader','IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL): Detect the user's language and write EVERY visible text value in that same language.

LOCAL_KNOWLEDGE_DATA (CRITICAL when provided): These are REAL items. You MUST use them ALL. Include a gallery or feature-grid section listing every item by name with neighborhood and description. Do NOT replace with fictional items.

REAL_WORLD_DATA (CRITICAL when provided): Real items from Wikipedia. Use them exactly in gallery/feature-grid sections.

DESIGN LIKE A SENIOR DESIGNER:
- Bold, cohesive aesthetic. Dark theme for dramatic/tech/premium; light for friendly/food/services.
- Distinctive font pairing. Display: ${DISPLAY_FONTS.join(', ')}. Body: ${BODY_FONTS.join(', ')}.
- Cohesive palette with dominant color and sharp accent (hex values).
- Rich, varied page: strong hero, deliberate sequence of 5-8 sections.

SECTION TYPES: hero (eyebrow,heading,subheading,cta,ctaSecondary), hero-split (+body), feature-grid (eyebrow,heading,subheading,items[]{icon,title,body}), stats (heading,stats[]{value,label}), gallery (heading,items[]{title,body}), video (eyebrow,heading,subheading,videoUrl=""), testimonials (heading,testimonials[]{quote,author,role}), cta (heading,subheading,cta), contact (eyebrow,heading,body,email,phone,address), about/text (eyebrow,heading,body).

OUTPUT: valid JSON only — no markdown, no backticks.
{"businessName":"...","theme":"light"|"dark","fonts":{"display":"...","body":"..."},"palette":{"primary":"#...","accent":"#...","background":"#...","surface":"#...","text":"#...","muted":"#..."},"sections":[...]}

RULES: Valid JSON. Real specific copy. 5-8 sections. Start with hero, end with contact.`

function isValidContent(p: any): boolean {
  return p && typeof p.businessName === 'string' && Array.isArray(p.sections) && p.sections.length > 0
}

function buildRecoveryContent(description: string, items: ValidatedItem[]) {
  const cards = items.slice(0, 6).map(item => ({ title: item.name, body: item.description }))
  return {
    businessName: 'SignalBoost Demo Site',
    theme: 'light',
    fonts: { display: 'Space Grotesk', body: 'DM Sans' },
    palette: { primary: '#2563eb', accent: '#f97316', background: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#64748b' },
    sections: [
      { type: 'hero', eyebrow: 'AI-ready prompt', heading: 'Your request is ready to launch', subheading: description, cta: 'Explore the data', ctaSecondary: 'Contact us' },
      { type: 'feature-grid', eyebrow: 'Fallback data', heading: 'Curated starter items', subheading: 'Demo records keep the page useful while live data recovers.', items: cards },
      { type: 'cta', heading: 'Ready for real data', subheading: 'Connect Wikipedia, CSV, scraper, or API sources when available.', cta: 'Generate again' },
      { type: 'contact', eyebrow: 'SignalBoost', heading: 'Keep building', body: 'We recovered gracefully and seeded safe demo content.', email: 'support@signalboostapp.com', phone: '', address: '' },
    ],
  }
}

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Please sign in to generate a website.' }), { status: 401 })
  }

  const body = await req.json()
  const description = body?.description
  if (!description || typeof description !== 'string' || description.trim().length < 4) {
    return new Response(JSON.stringify({ error: 'Please describe the website you want.' }), { status: 400 })
  }

  const trimmed      = description.trim()
  const language     = (body?.language || 'en').toString()
  const routing      = routeDataRequest(trimmed)
  const preprocessed = promptPreprocessor(trimmed)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      let wikiItems:    WikiItem[]       = []
      let localItems:   ValidLocalItem[] = []
      let fallbackSeeded                 = false
      let promptDataBlock                = ''
      let localCacheHit                  = false
      let siteDesignCacheHit             = false

      // ── Layer 1: Site design cache check (fastest path — ~3 sec) ───────────
      await writer.write(encode({
        type:    'status',
        step:    'cache_check',
        message: '⚡ Checking cache…',
      }))

      const cachedSite = await getSiteDesignCache({ userPrompt: trimmed, language, maxAge: 24 })

      if (cachedSite && isValidContent(cachedSite)) {
        siteDesignCacheHit = true
        console.log('Sites generate: SITE CACHE HIT — returning instantly')

        await writer.write(encode({
          type:    'status',
          step:    'site_cache_hit',
          message: '⚡ Loaded from cache instantly',
        }))

        await writer.write(encode({
          type:       'result',
          content:    cachedSite,
          preprocessor: {
            mode:             routing.mode,
            category:         routing.category,
            siteDesignCacheHit: true,
            localCacheHit:    false,
            fallbackUsed:     false,
          },
        }))

        await writer.close()
        return
      }

      // ── Layer 2: Data fetch (local items or Wikipedia) ─────────────────────
      await writer.write(encode({
        type:    'status',
        step:    'routing',
        message: routing.mode === 'local_knowledge'
          ? `🔍 Checking local knowledge cache for ${routing.category.replace('_', ' ')}…`
          : routing.mode === 'wikipedia'
            ? `🌐 Searching Wikipedia for "${routing.wikiQuery}"…`
            : '🔍 Analyzing your request…',
      }))

      if (routing.mode === 'local_knowledge') {
        // Layer 2a: local items cache
        const cached = await getCachedLocalItems({ userPrompt: trimmed, language, minItems: 10, maxAge: 48 })

        if (cached && cached.length >= 10) {
          localCacheHit = true
          localItems    = cached
          console.log(`Sites generate: LOCAL ITEMS CACHE HIT — ${cached.length} items`)

          await writer.write(encode({
            type:    'status',
            step:    'data_ready',
            message: `⚡ Found ${localItems.length} cached items — designing with Haiku…`,
            items:   localItems.slice(0, 5).map(i => i.name),
            cached:  true,
          }))
        } else {
          // Cache miss — generate with Sonnet
          await writer.write(encode({
            type:    'status',
            step:    'data',
            message: `🧠 Generating real ${routing.category.replace('_', ' ')} with Claude Sonnet…`,
          }))

          localItems = await runLocalKnowledgeMode({
            userPrompt: trimmed,
            language,
            category:   routing.category,
            count:      20,
          })

          console.log(`Sites generate: LOCAL ITEMS CACHE MISS — Sonnet generated ${localItems.length} items`)

          if (localItems.length > 0) {
            saveLocalItems(localItems, { userPrompt: trimmed, language, category: routing.category }).catch(() => {})

            await writer.write(encode({
              type:    'status',
              step:    'data_ready',
              message: `✅ Generated ${localItems.length} real items — designing with Haiku…`,
              items:   localItems.slice(0, 5).map(i => i.name),
              cached:  false,
            }))
          }
        }

        if (localItems.length > 0) {
          const itemList = localItems.slice(0, 20).map((item, i) =>
            `${i + 1}. ${item.name}${item.neighborhood ? ` (${item.neighborhood}${item.zone ? ', ' + item.zone : ''})` : ''}${item.description ? ' — ' + item.description : ''}`,
          ).join('\n')

          promptDataBlock = `

LOCAL_KNOWLEDGE_DATA (real items — use ALL of these in the site):
${itemList}

IMPORTANT: Include a gallery or feature-grid section listing EVERY item above by name.`
        }

      } else if (routing.mode === 'wikipedia' && routing.wikiQuery) {
        wikiItems = await fetchWikipediaItems(routing.wikiQuery)

        if (wikiItems.length > 0) {
          saveWikipediaItems(routing.wikiQuery, wikiItems).catch(() => {})

          await writer.write(encode({
            type:    'status',
            step:    'data_ready',
            message: `✅ Found ${wikiItems.length} Wikipedia articles — designing with Haiku…`,
            items:   wikiItems.slice(0, 5).map(i => i.title),
          }))

          const itemList = wikiItems.slice(0, 12).map((item, i) =>
            `${i + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}`,
          ).join('\n')

          promptDataBlock = `

REAL_WORLD_DATA (from Wikipedia):
${itemList}

IMPORTANT: Include a gallery or feature-grid section with these real items by name.`
        }
      }

      // Fallback if no data
      if (localItems.length === 0 && wikiItems.length === 0 && routing.mode !== 'none') {
        seedFallbackItems(routing.localQuery || routing.wikiQuery).catch(() => {})
        const fallbackItems = buildFallbackItems(routing.localQuery || routing.wikiQuery, 8)
        fallbackSeeded = true
        promptDataBlock = `

FALLBACK_DEMO_DATA:
${fallbackItems.map((item, i) => `${i + 1}. ${item.name} — ${item.description}`).join('\n')}`
      }

      // ── Layer 3: Site design with Haiku (fast) ─────────────────────────────
      await writer.write(encode({
        type:    'status',
        step:    'designing',
        message: '🎨 Designing your website with Haiku…',
      }))

      const userMessage = `${preprocessed.optimizedPrompt}\n\nRAW_USER_INPUT:\n${trimmed}${promptDataBlock}`
      const raw = await callHaiku(SYSTEM_PROMPT, userMessage)

      if (!raw) {
        const fallbackItems = buildFallbackItems(routing.localQuery, 8)
        seedFallbackItems(routing.localQuery).catch(() => {})
        await writer.write(encode({
          type:    'result',
          content: buildRecoveryContent(trimmed, fallbackItems),
          error:   'AI model unavailable. A fallback page was generated.',
        }))
        await writer.close()
        return
      }

      let parsed: any = null
      try {
        const firstBrace = raw.indexOf('{'), lastBrace = raw.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
        }
      } catch {
        parsed = buildRecoveryContent(trimmed, buildFallbackItems(routing.localQuery, 8))
        fallbackSeeded = true
      }

      if (!isValidContent(parsed)) {
        parsed = buildRecoveryContent(trimmed, buildFallbackItems(routing.localQuery, 8))
        fallbackSeeded = true
      }

      if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

      // Save site design to cache for next time — non-blocking
      if (!fallbackSeeded) {
        saveSiteDesign(parsed, { userPrompt: trimmed, language }).catch(() => {})
      }

      await writer.write(encode({
        type:        'result',
        content:     parsed,
        localItems:  localItems.length > 0 ? localItems : undefined,
        wikiItems:   wikiItems.length > 0  ? wikiItems  : undefined,
        attribution: wikiItems.length > 0  ? 'Data from Wikipedia, licensed under CC-BY-SA 4.0.' : undefined,
        preprocessor: {
          mode:               routing.mode,
          category:           routing.category,
          confidence:         routing.confidence,
          siteDesignCacheHit,
          localCacheHit,
          fallbackUsed:       fallbackSeeded,
          localCount:         localItems.length,
          wikiCount:          wikiItems.length,
        },
      }))

      await writer.close()

    } catch (error) {
      console.error('Sites generate streaming error', error)
      try {
        const fallbackItems = buildFallbackItems(null, 8)
        await writer.write(encode({
          type:    'result',
          content: buildRecoveryContent('We recovered from an unexpected generation error.', fallbackItems),
          error:   'Something went wrong. A fallback page was generated.',
        }))
        await writer.close()
      } catch { /* writer already closed */ }
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type':      'application/x-ndjson',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
