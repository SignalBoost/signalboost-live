// saas/app/api/sites/generate/route.ts

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

export const dynamic = 'force-dynamic'

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'SignalBoostApp/1.0 (https://saas.signalboostapp.com; support@signalboostapp.com)'

type WikiItem = { title: string; description: string; image_url: string | null; wiki_url: string }

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ── DB save is NON-BLOCKING — never throws, never kills site generation ───────
async function saveValidatedItems(items: ValidatedItem[]): Promise<number> {
  if (items.length === 0) return 0
  try {
    const db = supabaseAdmin()
    const { data, error } = await db.from('items').upsert(items, { onConflict: 'source_url' }).select('id')
    if (error) {
      console.error('Sites generate: DB save failed (non-blocking):', error.message)
      return 0
    }
    return data?.length ?? items.length
  } catch (err) {
    console.error('Sites generate: DB save exception (non-blocking):', err)
    return 0
  }
}

// ── DB save is NON-BLOCKING — never throws, never kills site generation ───────
async function saveWikipediaItems(query: string, wikiItems: WikiItem[]): Promise<number> {
  const { items, skippedRows } = validateItems(
    wikiItems.map((item) => ({
      name:        item.title,
      description: item.description,
      image_url:   item.image_url,
      source_url:  item.wiki_url,
      metadata:    { source: 'wikipedia', query, license: 'CC-BY-SA' },
    })),
    query,
  )

  skippedRows.forEach((row) => console.warn('Sites generate: skipped Wikipedia row', row))
  return saveValidatedItems(items)
}

async function seedFallbackItems(query: string | null): Promise<number> {
  const fallbackRows = buildFallbackItems(query, 30)
  return saveValidatedItems(fallbackRows)
}

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

async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userContent }] }),
    })
    if (!response.ok) { console.error('Sites generate Anthropic:', response.status, await response.text()); return null }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) { console.error('Sites generate Claude error', err); return null }
}

const DISPLAY_FONTS = ['Fraunces','Playfair Display','Bricolage Grotesque','Space Grotesk','Syne','Sora','DM Serif Display','Archivo','Unbounded']
const BODY_FONTS    = ['DM Sans','Manrope','Work Sans','Outfit','Spline Sans','Newsreader','IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL): Detect the user's language and write EVERY visible text value in that same language.

REAL-WORLD DATA (CRITICAL when provided): If the user message includes a REAL_WORLD_DATA block, you MUST use those real items. Include a gallery or feature-grid section listing them by name with their descriptions. Do NOT invent fictional alternatives.

DESIGN LIKE A SENIOR DESIGNER:
- Bold, cohesive aesthetic that fits the specific business. Dark theme for dramatic/tech/premium; light for friendly/food/services.
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
  const cards = items.slice(0, 6).map((item) => ({ title: item.name, body: item.description }))
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
    const preprocessed = promptPreprocessor(trimmed)
    const wikiQuery = preprocessed.query
    const shouldFetch = Boolean(wikiQuery && !preprocessed.shouldUseFallback && preprocessed.confidence >= PROMPT_PREPROCESSOR_CONFIDENCE_THRESHOLD)
    let wikiItems: WikiItem[] = []
    let fallbackSeeded = false

    console.log('Sites generate preprocessor:', {
      intent: preprocessed.intent,
      query: wikiQuery,
      confidence: preprocessed.confidence,
      fallback: preprocessed.shouldUseFallback,
      keywords: preprocessed.keywords,
      skippedRows: preprocessed.validation.skippedRows,
    })

    if (shouldFetch && wikiQuery) {
      wikiItems = await fetchWikipediaItems(wikiQuery)
      console.log(`Sites generate: fetched ${wikiItems.length} Wikipedia items for "${wikiQuery}"`)

      const saved = await saveWikipediaItems(wikiQuery, wikiItems)
      console.log('Sites generate: saved Wikipedia rows', { saved, skipped: Math.max(0, wikiItems.length - saved) })
    }

    let promptDataBlock = ''
    if (wikiItems.length > 0) {
      const itemList = wikiItems.slice(0, 12)
        .map((item, i) => `${i + 1}. ${item.title}${item.description ? ' — ' + item.description : ''} Source: ${item.wiki_url}`)
        .join('\n')
      promptDataBlock = `

REAL_WORLD_DATA (from Wikipedia — use these real items in the site):
${itemList}

IMPORTANT: Include a gallery or feature-grid section with these real items by name.`
    } else {
      const seeded = await seedFallbackItems(wikiQuery)
      fallbackSeeded = true
      console.log('Sites generate: fallback demo seed used', { seeded, query: wikiQuery })
      const fallbackItems = buildFallbackItems(wikiQuery, 8)
      promptDataBlock = `

FALLBACK_DEMO_DATA (safe demo rows — use if real data is unavailable):
${fallbackItems
        .map((item, i) => `${i + 1}. ${item.name} — ${item.description} Source: ${item.source_url}`)
        .join('\n')}`
    }

    const userMessage = `${preprocessed.optimizedPrompt}

RAW_USER_INPUT:
${trimmed}${promptDataBlock}`

    const raw = await callClaude(SYSTEM_PROMPT, userMessage)
    if (!raw) {
      const fallbackItems = buildFallbackItems(wikiQuery, 8)
      await seedFallbackItems(wikiQuery)
      return NextResponse.json({
        content: buildRecoveryContent(preprocessed.cleanedPrompt, fallbackItems),
        message: 'The live AI model is unavailable, so I interpreted your request and generated a safe demo page instead.',
        transparencyMessage: preprocessed.transparencyMessage,
        preprocessor: {
          intent: preprocessed.intent,
          query: wikiQuery,
          confidence: preprocessed.confidence,
          fallbackUsed: true,
        },
      })
    }

    let parsed: any = null
    try {
      const firstBrace = raw.indexOf('{'), lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch (parseError) {
      console.error('Sites generate: JSON parse failed; using fallback content', parseError)
      parsed = buildRecoveryContent(preprocessed.cleanedPrompt, buildFallbackItems(wikiQuery, 8))
      fallbackSeeded = true
      await seedFallbackItems(wikiQuery)
    }

    if (!isValidContent(parsed)) {
      console.warn('Sites generate: invalid AI content; using fallback content')
      parsed = buildRecoveryContent(preprocessed.cleanedPrompt, buildFallbackItems(wikiQuery, 8))
      fallbackSeeded = true
      await seedFallbackItems(wikiQuery)
    }
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

    return NextResponse.json({
      content:     parsed,
      wikiItems:   wikiItems.length > 0 ? wikiItems : undefined,
      attribution: wikiItems.length > 0 ? 'Data from Wikipedia, licensed under CC-BY-SA 4.0.' : undefined,
      transparencyMessage: preprocessed.transparencyMessage,
      preprocessor: {
        intent: preprocessed.intent,
        query: wikiQuery,
        confidence: preprocessed.confidence,
        confidenceLabel: preprocessed.confidenceLabel,
        fallbackUsed: fallbackSeeded || wikiItems.length === 0,
        optimizedPrompt: preprocessed.optimizedPrompt,
        validation: preprocessed.validation,
      },
    })
  } catch (error) {
    console.error('Sites generate error', error)
    const fallbackItems = buildFallbackItems(null, 8)
    await seedFallbackItems(null)
    return NextResponse.json({
      content: buildRecoveryContent('We recovered from an unexpected generation error.', fallbackItems),
      message: 'Something went wrong, so I seeded safe demo data and generated a fallback page instead.',
      transparencyMessage: 'I interpreted your request as: a recoverable website generation request using fallback demo data.',
      preprocessor: { intent: 'site_generation', query: null, confidence: 0, fallbackUsed: true },
    })
  }
}
