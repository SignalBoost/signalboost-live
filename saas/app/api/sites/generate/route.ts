// saas/app/api/sites/generate/route.ts
//
// Streaming + AI orchestration + two-layer cache:
//   Layer 1 — Site design cache: exact prompt match → return cached site (~3 sec)
//   Layer 2 — Local items cache: same category/city → skip local generation (~15 sec)
//   Layer 3 — AI mode output + Haiku site design

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildFallbackItems,
  promptPreprocessor,
  type ValidatedItem,
} from '@/lib/ai/promptPreprocessor'
import { routeIntent, type IntentType } from '@/lib/ai/intentRouter'
import {
  runBusinessMode,
  runGlobalKnowledgeMode,
  runLocalKnowledgeMode,
  type ValidBusinessSite,
  type ValidGlobalKnowledge,
  type ValidLocalItem,
} from '@/lib/ai/modes'
import {
  getCachedLocalItems,
  getSiteDesignCache,
  saveLocalItems,
  saveSiteDesign,
} from '@/lib/ai/memory'
import { enrichSiteMedia } from '@/lib/media/sourcing'

export const dynamic = 'force-dynamic'

type SiteGenerationMode = Exclude<IntentType, 'creative'>

type OrchestrationResult = {
  mode: SiteGenerationMode
  data: ValidLocalItem[] | ValidBusinessSite | ValidGlobalKnowledge | null
  localItems: ValidLocalItem[]
  localCacheHit: boolean
  fallbackSeeded: boolean
  promptDataBlock: string
}

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

async function seedFallbackItems(query: string | null): Promise<number> {
  return saveValidatedItems(buildFallbackItems(query, 30))
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

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description and optional AI orchestration data, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL): Detect the user's language and write EVERY visible string in that language.

AI_ORCHESTRATION_DATA (CRITICAL when provided): Use the supplied local, business, or global knowledge payload as the factual backbone of the page. Do not invent conflicting facts. If a list of real local items is supplied, include every item by name.

VISUAL DIRECTION:
- Premium editorial style, not generic SaaS template.
- Choose fonts only from: display=${DISPLAY_FONTS.join(', ')}; body=${BODY_FONTS.join(', ')}.
- Strong palette with dominant color and sharp accent (hex values).
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
      { type: 'cta', heading: 'Ready for real data', subheading: 'Connect AI, CSV, scraper, or API sources when available.', cta: 'Generate again' },
      { type: 'contact', eyebrow: 'SignalBoost', heading: 'Keep building', body: 'We recovered gracefully and seeded safe demo content.', email: 'support@signalboostapp.com', phone: '', address: '' },
    ],
  }
}

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

function normalizeSiteMode(intent: IntentType): SiteGenerationMode {
  return intent === 'creative' ? 'business' : intent
}

function inferLocalCategory(userPrompt: string): string | undefined {
  const lower = userPrompt.toLowerCase()
  if (lower.includes('várzea') || lower.includes('varzea') || lower.includes('football') || lower.includes('soccer') || lower.includes('futebol')) return 'football_teams'
  if (lower.includes('restaurant') || lower.includes('restaurante')) return 'restaurants'
  if (lower.includes('bakery') || lower.includes('padaria')) return 'bakeries'
  if (lower.includes('gym') || lower.includes('academia')) return 'gyms'
  if (lower.includes('barber') || lower.includes('barbearia')) return 'barbershops'
  if (lower.includes('museum') || lower.includes('museu')) return 'museums'
  if (lower.includes('church') || lower.includes('igreja')) return 'churches'
  if (lower.includes('beach') || lower.includes('praia')) return 'beaches'
  return undefined
}

function buildLocalItemsBlock(localItems: ValidLocalItem[]): string {
  if (localItems.length === 0) return ''

  const itemList = localItems.slice(0, 20).map((item, i) =>
    `${i + 1}. ${item.name}${item.neighborhood ? ` (${item.neighborhood}${item.zone ? ', ' + item.zone : ''})` : ''}${item.description ? ' — ' + item.description : ''}`,
  ).join('\n')

  return `

AI_ORCHESTRATION_DATA — LOCAL_KNOWLEDGE (real items — use ALL of these in the site):
${itemList}

IMPORTANT: Include a gallery or feature-grid section listing EVERY item above by name.`
}

function buildBusinessBlock(site: ValidBusinessSite): string {
  return `

AI_ORCHESTRATION_DATA — BUSINESS:
${JSON.stringify(site, null, 2)}

IMPORTANT: Convert this business content into a polished one-page website using the required section schema.`
}

function buildGlobalKnowledgeBlock(knowledge: ValidGlobalKnowledge): string {
  const keyPoints = knowledge.key_points.map((point, i) => `${i + 1}. ${point}`).join('\n')
  const related = knowledge.related_entities.length > 0 ? knowledge.related_entities.join(', ') : 'None supplied'

  return `

AI_ORCHESTRATION_DATA — GLOBAL_KNOWLEDGE:
Topic: ${knowledge.topic}
Summary: ${knowledge.summary}
Key points:
${keyPoints || 'No key points supplied'}
Related entities: ${related}

IMPORTANT: Present this knowledge as a credible, visually rich informational website.`
}

async function runOrchestration(args: {
  mode: SiteGenerationMode
  userPrompt: string
  language: string
  writer: WritableStreamDefaultWriter<Uint8Array>
}): Promise<OrchestrationResult> {
  const { mode, userPrompt, language, writer } = args
  let data: OrchestrationResult['data'] = null
  let localItems: ValidLocalItem[] = []
  let localCacheHit = false
  let fallbackSeeded = false
  let promptDataBlock = ''

  if (mode === 'local_knowledge') {
    const category = inferLocalCategory(userPrompt)

    await writer.write(encode({
      type:    'status',
      step:    'routing',
      message: category
        ? `🔍 Checking local knowledge cache for ${category.replace('_', ' ')}…`
        : '🔍 Checking local knowledge cache…',
    }))

    const cached = await getCachedLocalItems({ userPrompt, language, minItems: 10, maxAge: 48 })

    if (cached && cached.length >= 10) {
      localCacheHit = true
      localItems    = cached
      data          = cached
      console.log(`Sites generate: LOCAL ITEMS CACHE HIT — ${cached.length} items`)

      await writer.write(encode({
        type:    'status',
        step:    'data_ready',
        message: `⚡ Found ${localItems.length} cached items — designing with Haiku…`,
        items:   localItems.slice(0, 5).map(i => i.name),
        cached:  true,
      }))
    } else {
      await writer.write(encode({
        type:    'status',
        step:    'data',
        message: category
          ? `🧠 Generating real ${category.replace('_', ' ')} with AI orchestration…`
          : '🧠 Generating real local knowledge with AI orchestration…',
      }))

      localItems = await runLocalKnowledgeMode({
        userPrompt,
        language,
        category,
        count: 20,
      })
      data = localItems

      console.log(`Sites generate: LOCAL ITEMS CACHE MISS — generated ${localItems.length} items`)

      if (localItems.length > 0) {
        saveLocalItems(localItems, { userPrompt, language, category }).catch(() => {})

        await writer.write(encode({
          type:    'status',
          step:    'data_ready',
          message: `✅ Generated ${localItems.length} real items — designing with Haiku…`,
          items:   localItems.slice(0, 5).map(i => i.name),
          cached:  false,
        }))
      }
    }

    promptDataBlock = buildLocalItemsBlock(localItems)
  } else if (mode === 'business') {
    await writer.write(encode({
      type:    'status',
      step:    'data',
      message: '🧠 Generating business content with AI orchestration…',
    }))

    const site = await runBusinessMode({ userPrompt, language })
    data = site

    if (site) {
      promptDataBlock = buildBusinessBlock(site)
      await writer.write(encode({
        type:    'status',
        step:    'data_ready',
        message: '✅ Business content generated — designing with Haiku…',
      }))
    }
  } else if (mode === 'global_knowledge') {
    await writer.write(encode({
      type:    'status',
      step:    'data',
      message: '🧠 Generating global knowledge with AI orchestration…',
    }))

    const knowledge = await runGlobalKnowledgeMode({ userPrompt, language })
    data = knowledge

    if (knowledge) {
      promptDataBlock = buildGlobalKnowledgeBlock(knowledge)
      await writer.write(encode({
        type:    'status',
        step:    'data_ready',
        message: '✅ Knowledge content generated — designing with Haiku…',
      }))
    }
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    seedFallbackItems(userPrompt).catch(() => {})
    const fallbackItems = buildFallbackItems(userPrompt, 8)
    fallbackSeeded = true
    promptDataBlock = `

FALLBACK_DEMO_DATA:
${fallbackItems.map((item, i) => `${i + 1}. ${item.name} — ${item.description}`).join('\n')}`
  }

  return { mode, data, localItems, localCacheHit, fallbackSeeded, promptDataBlock }
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
  const routed       = routeIntent({ userPrompt: trimmed, language: body?.language?.toString() })
  const language     = routed.language
  const mode         = normalizeSiteMode(routed.intent)
  const preprocessed = promptPreprocessor(trimmed)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      let siteDesignCacheHit = false

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
          content:    enrichSiteMedia(cachedSite, trimmed),
          preprocessor: {
            mode,
            routedIntent: routed.intent,
            confidence: routed.confidence,
            reason: routed.reason,
            siteDesignCacheHit,
            localCacheHit: false,
            fallbackUsed: false,
          },
        }))

        await writer.close()
        return
      }

      // ── Layer 2: AI orchestration ───────────────────────────────────────────
      const orchestration = await runOrchestration({ mode, userPrompt: trimmed, language, writer })

      // ── Layer 3: Site design with Haiku (fast) ─────────────────────────────
      await writer.write(encode({
        type:    'status',
        step:    'designing',
        message: '🎨 Designing your website with Haiku…',
      }))

      const userMessage = `${preprocessed.optimizedPrompt}\n\nRAW_USER_INPUT:\n${trimmed}${orchestration.promptDataBlock}`
      const raw = await callHaiku(SYSTEM_PROMPT, userMessage)

      if (!raw) {
        const fallbackItems = buildFallbackItems(trimmed, 8)
        seedFallbackItems(trimmed).catch(() => {})
        await writer.write(encode({
          type:    'result',
          content: enrichSiteMedia(buildRecoveryContent(trimmed, fallbackItems), trimmed),
          error:   'AI model unavailable. A fallback page was generated.',
        }))
        await writer.close()
        return
      }

      let parsed: any = null
      let fallbackSeeded = orchestration.fallbackSeeded
      try {
        const firstBrace = raw.indexOf('{'), lastBrace = raw.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
        }
      } catch {
        parsed = buildRecoveryContent(trimmed, buildFallbackItems(trimmed, 8))
        fallbackSeeded = true
      }

      if (!isValidContent(parsed)) {
        parsed = buildRecoveryContent(trimmed, buildFallbackItems(trimmed, 8))
        fallbackSeeded = true
      }

      if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

      parsed = enrichSiteMedia(parsed, trimmed)

      // Save site design to cache for next time — non-blocking
      if (!fallbackSeeded) {
        saveSiteDesign(parsed, { userPrompt: trimmed, language }).catch(() => {})
      }

      await writer.write(encode({
        type:       'result',
        content:    parsed,
        localItems: orchestration.localItems.length > 0 ? orchestration.localItems : undefined,
        orchestration: {
          mode: orchestration.mode,
          data: orchestration.data,
        },
        preprocessor: {
          mode,
          routedIntent: routed.intent,
          confidence: routed.confidence,
          reason: routed.reason,
          siteDesignCacheHit,
          localCacheHit: orchestration.localCacheHit,
          fallbackUsed: fallbackSeeded,
          localCount: orchestration.localItems.length,
        },
      }))

      await writer.close()

    } catch (error) {
      console.error('Sites generate streaming error', error)
      try {
        const fallbackItems = buildFallbackItems(null, 8)
        await writer.write(encode({
          type:    'result',
          content: enrichSiteMedia(buildRecoveryContent('We recovered from an unexpected generation error.', fallbackItems), trimmed),
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
