// saas/app/api/sites/generate/route.ts
//
// Streaming AI site generation with orchestration:
//   1. Route the prompt through the central intent router.
//   2. Use AI modes for local knowledge, business copy, or global knowledge.
//   3. Render the final website JSON with Haiku.
//   4. Cache successful site designs after the response is sent.

import { NextRequest, after } from 'next/server'
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
  type ValidLocalItem,
} from '@/lib/ai/modes'
import {
  getCachedLocalItems,
  getSiteDesignCache,
  saveLocalItems,
  saveSiteDesign,
} from '@/lib/ai/memory'

export const dynamic = 'force-dynamic'

type SiteRouting = {
  mode: IntentType
  category: string
  confidence: number
  reason?: string
  query: string
}

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function saveValidatedItems(items: ValidatedItem[]): Promise<number> {
  if (items.length === 0) return 0

  try {
    const db = supabaseAdmin()
    const { data, error } = await db.from('items').upsert(items, { onConflict: 'source_url' }).select('id')
    if (error) {
      console.error('Sites generate: DB save failed:', error.message)
      return 0
    }
    return data?.length ?? items.length
  } catch (err) {
    console.error('Sites generate: DB save exception:', err)
    return 0
  }
}

async function seedFallbackItems(query: string | null): Promise<number> {
  return saveValidatedItems(buildFallbackItems(query, 30))
}

async function callHaiku(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
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

const DISPLAY_FONTS = [
  'Fraunces',
  'Playfair Display',
  'Bricolage Grotesque',
  'Space Grotesk',
  'Syne',
  'Sora',
  'DM Serif Display',
  'Archivo',
  'Unbounded',
]
const BODY_FONTS = ['DM Sans', 'Manrope', 'Work Sans', 'Outfit', 'Spline Sans', 'Newsreader', 'IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL): Detect the user's language and write EVERY visible text value in that same language.

LOCAL_KNOWLEDGE_DATA (CRITICAL when provided): These are REAL items. You MUST use them ALL. Include a gallery or feature-grid section listing every item by name with neighborhood and description. Do NOT replace with fictional items.

GLOBAL_KNOWLEDGE_DATA (CRITICAL when provided): Use the supplied topic, summary, key points, and related entities to ground the page.

BUSINESS_SITE_CONTENT (CRITICAL when provided): Use the supplied structured business copy for hero, services, testimonials, FAQ, and contact sections.

DESIGN LIKE A SENIOR DESIGNER:
- Bold, cohesive aesthetic. Dark theme for dramatic/tech/premium; light for friendly/food/services.
- Distinctive font pairing. Display: ${DISPLAY_FONTS.join(', ')}. Body: ${BODY_FONTS.join(', ')}.
- Cohesive palette with dominant color and sharp accent (hex values).
- Rich, varied page: strong hero, deliberate sequence of 5-8 sections.

SECTION TYPES: hero (eyebrow,heading,subheading,cta,ctaSecondary), hero-split (+body), feature-grid (eyebrow,heading,subheading,items[]{icon,title,body}), stats (heading,stats[]{value,label}), gallery (heading,items[]{title,body}), video (eyebrow,heading,subheading,videoUrl=""), testimonials (heading,testimonials[]{quote,author,role}), cta (heading,subheading,cta), contact (eyebrow,heading,body,email,phone,address), about/text (eyebrow,heading,body).

OUTPUT: valid JSON only — no markdown, no backticks.
{"businessName":"...","theme":"light"|"dark","fonts":{"display":"...","body":"..."},"palette":{"primary":"#...","accent":"#...","background":"#...","surface":"#...","text":"#...","muted":"#..."},"sections":[...]}

RULES: Valid JSON. Real specific copy. 5-8 sections. Start with hero, end with contact.`

function detectCategory(request: string): string {
  const lower = request.toLowerCase()
  if (/várzea|varzea|football|soccer|futebol|team|teams|time|times/.test(lower)) return 'football_teams'
  if (/restaurant|restaurante|food|comida|bar|café|cafe/.test(lower)) return 'restaurants'
  if (/neighborhood|bairro|district|cidade|city/.test(lower)) return 'neighborhoods'
  if (/gym|academia|fitness/.test(lower)) return 'gyms'
  if (/barber|barbearia|salon|salão/.test(lower)) return 'barbershops'
  return 'general'
}

function isValidContent(content: unknown): content is { businessName: string; theme?: string; sections: unknown[] } {
  return Boolean(
    content &&
    typeof content === 'object' &&
    typeof (content as { businessName?: unknown }).businessName === 'string' &&
    Array.isArray((content as { sections?: unknown }).sections) &&
    (content as { sections: unknown[] }).sections.length > 0,
  )
}

function buildRecoveryContent(description: string, items: ValidatedItem[]) {
  const cards = items.slice(0, 6).map(item => ({ title: item.name, body: item.description }))
  return {
    businessName: 'SignalBoost Demo Site',
    theme: 'light',
    fonts: { display: 'Space Grotesk', body: 'DM Sans' },
    palette: {
      primary: '#2563eb',
      accent: '#f97316',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
    },
    sections: [
      {
        type: 'hero',
        eyebrow: 'AI-ready prompt',
        heading: 'Your request is ready to launch',
        subheading: description,
        cta: 'Explore the data',
        ctaSecondary: 'Contact us',
      },
      {
        type: 'feature-grid',
        eyebrow: 'Fallback data',
        heading: 'Curated starter items',
        subheading: 'Demo records keep the page useful while live data recovers.',
        items: cards,
      },
      {
        type: 'cta',
        heading: 'Ready for real data',
        subheading: 'Use AI orchestration, CSV, scraper, or API sources when available.',
        cta: 'Generate again',
      },
      {
        type: 'contact',
        eyebrow: 'SignalBoost',
        heading: 'Keep building',
        body: 'We recovered gracefully and seeded safe demo content.',
        email: 'support@signalboostapp.com',
        phone: '',
        address: '',
      },
    ],
  }
}

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

function buildLocalDataBlock(items: ValidLocalItem[]): string {
  const itemList = items.slice(0, 20).map((item, index) => {
    const location = item.neighborhood ? ` (${item.neighborhood}${item.zone ? `, ${item.zone}` : ''})` : ''
    const description = item.description ? ` — ${item.description}` : ''
    return `${index + 1}. ${item.name}${location}${description}`
  }).join('\n')

  return `\n\nLOCAL_KNOWLEDGE_DATA (real items — use ALL of these in the site):\n${itemList}\n\nIMPORTANT: Include a gallery or feature-grid section listing EVERY item above by name.`
}

function buildBusinessDataBlock(site: Awaited<ReturnType<typeof runBusinessMode>>): string {
  return `\n\nBUSINESS_SITE_CONTENT:\n${JSON.stringify(site, null, 2)}\n\nIMPORTANT: Use this structured copy to render hero, services, testimonials, FAQ, and contact sections.`
}

function buildGlobalDataBlock(knowledge: Awaited<ReturnType<typeof runGlobalKnowledgeMode>>): string {
  const keyPoints = knowledge.key_points.map((point, index) => `${index + 1}. ${point}`).join('\n')

  return `\n\nGLOBAL_KNOWLEDGE_DATA:\nTopic: ${knowledge.topic}\nSummary: ${knowledge.summary}\nKey points:\n${keyPoints}\nRelated entities: ${knowledge.related_entities.join(', ')}\n\nIMPORTANT: Ground the site in this structured global knowledge.`
}

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

  const trimmed = description.trim()
  const language = (body?.language || 'en').toString()
  const routedIntent = routeIntent({ userPrompt: trimmed, language })
  const routing: SiteRouting = {
    mode: routedIntent.intent,
    category: detectCategory(trimmed),
    confidence: routedIntent.confidence,
    reason: routedIntent.reason,
    query: trimmed,
  }
  const preprocessed = promptPreprocessor(trimmed)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      let localItems: ValidLocalItem[] = []
      let businessContent: Awaited<ReturnType<typeof runBusinessMode>> | null = null
      let globalKnowledge: Awaited<ReturnType<typeof runGlobalKnowledgeMode>> | null = null
      let fallbackSeeded = false
      let promptDataBlock = ''
      let localCacheHit = false
      let siteDesignCacheHit = false

      await writer.write(encode({ type: 'status', step: 'cache_check', message: '⚡ Checking cache…' }))

      const cachedSite = await getSiteDesignCache({ userPrompt: trimmed, language, maxAge: 24 })

      if (cachedSite && isValidContent(cachedSite)) {
        siteDesignCacheHit = true
        console.log('Sites generate: SITE CACHE HIT — returning instantly')
        await writer.write(encode({ type: 'status', step: 'site_cache_hit', message: '⚡ Loaded from cache instantly' }))
        await writer.write(encode({
          type: 'result',
          content: cachedSite,
          preprocessor: {
            mode: routing.mode,
            category: routing.category,
            confidence: routing.confidence,
            reason: routing.reason,
            siteDesignCacheHit,
            localCacheHit: false,
            fallbackUsed: false,
          },
        }))
        await writer.close()
        return
      }

      await writer.write(encode({
        type: 'status',
        step: 'routing',
        message: routing.mode === 'local_knowledge'
          ? `🔍 Checking local knowledge cache for ${routing.category.replace('_', ' ')}…`
          : routing.mode === 'global_knowledge'
            ? '🌐 Building global knowledge context with AI…'
            : routing.mode === 'business'
              ? '🏢 Generating business site content with AI…'
              : '🎭 Building creative context with AI…',
      }))

      if (routing.mode === 'local_knowledge') {
        const cached = await getCachedLocalItems({ userPrompt: trimmed, language, minItems: 10, maxAge: 48 })

        if (cached && cached.length >= 10) {
          localCacheHit = true
          localItems = cached
          console.log(`Sites generate: LOCAL ITEMS CACHE HIT — ${cached.length} items`)
          await writer.write(encode({
            type: 'status',
            step: 'data_ready',
            message: `⚡ Found ${localItems.length} cached items — designing with Haiku…`,
            items: localItems.slice(0, 5).map(item => item.name),
            cached: true,
          }))
        } else {
          await writer.write(encode({
            type: 'status',
            step: 'data',
            message: `🧠 Generating ${routing.category.replace('_', ' ')} with Claude Sonnet…`,
          }))
          localItems = await runLocalKnowledgeMode({ userPrompt: trimmed, language, category: routing.category, count: 20 })
          console.log(`Sites generate: LOCAL ITEMS CACHE MISS — generated ${localItems.length} items`)

          if (localItems.length > 0) {
            saveLocalItems(localItems, { userPrompt: trimmed, language, category: routing.category }).catch(error => {
              console.error('Sites generate: saveLocalItems failed', error)
            })
            await writer.write(encode({
              type: 'status',
              step: 'data_ready',
              message: `✅ Generated ${localItems.length} items — designing with Haiku…`,
              items: localItems.slice(0, 5).map(item => item.name),
              cached: false,
            }))
          }
        }

        if (localItems.length > 0) {
          promptDataBlock = buildLocalDataBlock(localItems)
        }
      } else if (routing.mode === 'global_knowledge') {
        globalKnowledge = await runGlobalKnowledgeMode({ userPrompt: trimmed, language })
        await writer.write(encode({
          type: 'status',
          step: 'data_ready',
          message: '✅ Global knowledge context ready — designing with Haiku…',
        }))
        promptDataBlock = buildGlobalDataBlock(globalKnowledge)
      } else {
        businessContent = await runBusinessMode({ userPrompt: trimmed, language })
        await writer.write(encode({
          type: 'status',
          step: 'data_ready',
          message: routing.mode === 'creative'
            ? '✅ Creative brief converted into website copy — designing with Haiku…'
            : '✅ Business copy ready — designing with Haiku…',
        }))
        promptDataBlock = buildBusinessDataBlock(businessContent)
      }

      if (localItems.length === 0 && !businessContent && !globalKnowledge) {
        seedFallbackItems(routing.query).catch(error => {
          console.error('Sites generate: seedFallbackItems failed', error)
        })
        const fallbackItems = buildFallbackItems(routing.query, 8)
        fallbackSeeded = true
        promptDataBlock = `\n\nFALLBACK_DEMO_DATA:\n${fallbackItems.map((item, index) => `${index + 1}. ${item.name} — ${item.description}`).join('\n')}`
      }

      await writer.write(encode({ type: 'status', step: 'designing', message: '🎨 Designing your website with Haiku…' }))

      const userMessage = `${preprocessed.optimizedPrompt}\n\nRAW_USER_INPUT:\n${trimmed}${promptDataBlock}`
      const raw = await callHaiku(SYSTEM_PROMPT, userMessage)

      if (!raw) {
        const fallbackItems = buildFallbackItems(routing.query, 8)
        seedFallbackItems(routing.query).catch(error => {
          console.error('Sites generate: seedFallbackItems after model failure failed', error)
        })
        await writer.write(encode({
          type: 'result',
          content: buildRecoveryContent(trimmed, fallbackItems),
          error: 'AI model unavailable.',
        }))
        await writer.close()
        return
      }

      let parsed: any = null
      try {
        const firstBrace = raw.indexOf('{')
        const lastBrace = raw.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
        }
      } catch (error) {
        console.error('Sites generate: failed to parse Haiku JSON', error)
      }

      if (!isValidContent(parsed)) {
        parsed = buildRecoveryContent(trimmed, buildFallbackItems(routing.query, 8))
        fallbackSeeded = true
      }

      if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

      await writer.write(encode({
        type: 'result',
        content: parsed,
        localItems: localItems.length > 0 ? localItems : undefined,
        businessContent: businessContent || undefined,
        globalKnowledge: globalKnowledge || undefined,
        preprocessor: {
          mode: routing.mode,
          category: routing.category,
          confidence: routing.confidence,
          reason: routing.reason,
          siteDesignCacheHit,
          localCacheHit,
          fallbackUsed: fallbackSeeded,
          localCount: localItems.length,
          businessContent: Boolean(businessContent),
          globalKnowledge: Boolean(globalKnowledge),
        },
      }))

      await writer.close()

      if (!fallbackSeeded) {
        after(async () => {
          try {
            await saveSiteDesign(parsed, { userPrompt: trimmed, language })
            console.log('Sites generate: site design cached via after()')
          } catch (err) {
            console.error('Sites generate: after() saveSiteDesign failed', err)
          }
        })
      }
    } catch (error) {
      console.error('Sites generate streaming error', error)
      try {
        const fallbackItems = buildFallbackItems(null, 8)
        await writer.write(encode({
          type: 'result',
          content: buildRecoveryContent('We recovered from an unexpected generation error.', fallbackItems),
          error: 'Something went wrong.',
        }))
        await writer.close()
      } catch {
        // writer already closed
      }
    }
  })()

  return new Response(stream.readable, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  })
}
