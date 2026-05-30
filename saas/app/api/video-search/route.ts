// saas/app/api/video-search/route.ts
// POST /api/video-search
// Body: { prompt: string, mode?: 'auto' | 'search' | 'generate' | 'caption' | 'dub' }
// Returns: { intent, mode, query, results, message }

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { searchVideos } from '@/lib/video/search'

export const maxDuration = 30

type Mode = 'auto' | 'search' | 'generate' | 'caption' | 'dub'

type IntentResult = {
  mode: 'search' | 'generate' | 'caption' | 'dub'
  query: string
  language?: string
  duration?: number
  format?: string
  explanation: string
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

function timeoutResponse(message = 'videoSearch.timeout.generic') {
  return NextResponse.json(
    {
      error: message,
      timeout: true,
      recoverable: true,
    },
    { status: 504 }
  )
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function timedFetch(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError('videoSearch.timeout.aiService')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// ── GPT intent extraction ─────────────────────────────────────────────────────

async function extractIntent(prompt: string, mode: Mode): Promise<IntentResult> {
  const systemPrompt = `You are an AI assistant for SignalBoost, a multilingual content platform for podcasters and content creators.

The user has typed a prompt in the Lab (creative workspace). Your job is to extract their intent and return a JSON object.

Possible modes:
- "search": user wants to find existing video footage (historical events, sports, speeches, documentaries, etc.)
- "generate": user wants to create a new AI-generated video (ads, promos, talking-head videos)
- "caption": user wants to add captions/subtitles to an existing video
- "dub": user wants to dub/translate audio into another language

Rules:
- If mode is "auto", infer the best mode from the prompt.
- If the prompt mentions "find", "show me", "search for", "footage of", a historical event, a person, or a place → mode = "search"
- If the prompt mentions "create", "generate", "make", "ad", "promo", "video for my" → mode = "generate"
- For "search", extract a clean YouTube-friendly search query (remove filler words, keep key terms)
- For "generate", extract: target language (default "en"), duration in seconds (default 30), format ("9:16", "16:9", "1:1")
- Always return valid JSON only, no markdown, no explanation outside the JSON.

Return this exact shape:
{
  "mode": "search" | "generate" | "caption" | "dub",
  "query": "clean search query or video description",
  "language": "es" | "pt" | "pl" | "ru" | "en",
  "duration": 30,
  "format": "9:16",
  "explanation": "one sentence explaining what you understood and what you're doing"
}`

  const res = await timedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Mode override: ${mode}\nUser prompt: ${prompt}` },
      ],
      temperature: 0.2,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    }),
  }, 12000)

  if (!res.ok) {
    throw new Error(`OpenAI intent extraction failed: ${res.status}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'

  try {
    const parsed = JSON.parse(content)
    return {
      mode: parsed.mode ?? 'search',
      query: parsed.query ?? prompt,
      language: parsed.language ?? 'en',
      duration: parsed.duration ?? 30,
      format: parsed.format ?? '9:16',
      explanation: parsed.explanation ?? 'videoSearch.status.searching',
    }
  } catch {
    return {
      mode: 'search',
      query: prompt,
      language: 'en',
      duration: 30,
      format: '9:16',
      explanation: 'videoSearch.status.searchingPromptMatch',
    }
  }
}

// ── Generate intent ───────────────────────────────────────────────────────────

async function buildGenerateResponse(intent: IntentResult, prompt: string) {
  const scriptRes = await timedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional video scriptwriter for social media. Write a punchy, engaging script for a ${intent.duration}-second video in ${intent.language === 'es' ? 'Spanish' : intent.language === 'pt' ? 'Portuguese' : intent.language === 'pl' ? 'Polish' : intent.language === 'ru' ? 'Russian' : 'English'}. Format: just the spoken script, no stage directions, no timestamps. Keep it under ${Math.floor((intent.duration ?? 30) * 2.5)} words.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  }, 12000)

  const scriptData = scriptRes.ok ? await scriptRes.json() : null
  const script = scriptData?.choices?.[0]?.message?.content?.trim() ?? ''

  const LANG_AVATARS: Record<string, { name: string; id: string }[]> = {
    es: [{ name: 'Sofia (ES)', id: 'sofia_es' }, { name: 'Carlos (ES)', id: 'carlos_es' }],
    pt: [{ name: 'Ana (PT)', id: 'ana_pt' }, { name: 'Pedro (BR)', id: 'pedro_br' }],
    pl: [{ name: 'Maja (PL)', id: 'maja_pl' }],
    ru: [{ name: 'Natasha (RU)', id: 'natasha_ru' }],
    en: [{ name: 'Sarah (EN)', id: 'sarah_en' }, { name: 'Liam (EN)', id: 'liam_en' }],
  }

  const avatars = LANG_AVATARS[intent.language ?? 'en'] ?? LANG_AVATARS.en
  const estimatedCost = ((intent.duration ?? 30) / 60).toFixed(2)

  return {
    mode: 'generate',
    intent,
    script,
    avatars,
    estimatedCost: `~$${estimatedCost}`,
    format: intent.format ?? '9:16',
    language: intent.language ?? 'en',
    heygenReady: !!process.env.HEYGEN_API_KEY,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) {
    return NextResponse.json({ error: 'errors.unauthorized' }, { status: 401 })
  }

  let body: { prompt?: string; mode?: Mode }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'api.invalidJson' }, { status: 400 })
  }

  const prompt = (body.prompt ?? '').trim()
  const mode: Mode = body.mode ?? 'auto'

  if (!prompt) {
    return NextResponse.json({ error: 'api.promptRequired' }, { status: 400 })
  }

  let intent: IntentResult
  try {
    intent = await extractIntent(prompt, mode)
  } catch (err) {
    if (err instanceof TimeoutError) {
      return timeoutResponse('videoSearch.timeout.intent')
    }
    console.error('Intent extraction failed:', err)
    intent = {
      mode: 'search',
      query: prompt,
      language: 'en',
      duration: 30,
      format: '9:16',
      explanation: 'videoSearch.status.searchingPromptMatch',
    }
  }

  if (intent.mode === 'generate') {
    try {
      const generateData = await buildGenerateResponse(intent, prompt)
      return NextResponse.json({
        intent: intent.explanation,
        mode: 'generate',
        query: intent.query,
        results: [],
        generate: generateData,
        message: null,
      })
    } catch (err) {
      if (err instanceof TimeoutError) {
        return timeoutResponse('videoSearch.timeout.script')
      }
      console.error('Generate response failed:', err)
      return NextResponse.json({ error: 'videoSearch.errors.generateScriptFailed' }, { status: 502 })
    }
  }

  try {
    const results = await withTimeout(
      searchVideos(intent.query),
      15000,
      'videoSearch.timeout.search'
    )

    const hasPublic = results.some(r => r.license === 'public')
    const hasEmbeddable = results.some(r => r.license === 'embeddable')
    const allRestricted = results.length > 0 && results.every(r => r.license === 'restricted')

    let message: string | null = null
    if (allRestricted) {
      message = 'videoSearch.rights.restricted'
    } else if (!hasPublic && hasEmbeddable) {
      message = 'videoSearch.rights.embeddableOnly'
    }

    return NextResponse.json({
      intent: intent.explanation,
      mode: 'search',
      query: intent.query,
      results,
      generate: null,
      message,
    })
  } catch (err) {
    if (err instanceof TimeoutError) {
      return timeoutResponse('videoSearch.timeout.searchDetailed')
    }
    console.error('Video search failed:', err)
    return NextResponse.json({ error: 'videoSearch.errors.searchFailed' }, { status: 502 })
  }
}
