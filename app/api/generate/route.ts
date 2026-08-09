import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_STORE_MAX_SIZE = 1000

const ALLOWED_MODES = ['default'] as const
const LANGUAGE_PROMPTS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
} as const
const ALLOWED_FIELDS = new Set(['prompt', 'mode', 'language'])

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

type AllowedMode = (typeof ALLOWED_MODES)[number]
type AllowedLanguage = keyof typeof LANGUAGE_PROMPTS

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim() || 'unknown'
  }

  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown'
}

function cleanupExpiredRateLimits(now: number) {
  if (rateLimitStore.size <= RATE_LIMIT_STORE_MAX_SIZE) {
    return
  }

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key)
    }
  }
}

function checkRateLimit(req: Request) {
  const key = getClientIp(req)
  const now = Date.now()
  const existing = rateLimitStore.get(key)

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    cleanupExpiredRateLimits(now)
    return { limited: false }
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return { limited: false }
}

function validateRequestBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request body.' }
  }

  const record = body as Record<string, unknown>

  if (Object.keys(record).some((field) => !ALLOWED_FIELDS.has(field))) {
    return { error: 'Invalid request body.' }
  }

  if (typeof record.prompt !== 'string' || record.prompt.trim().length === 0) {
    return { error: 'Missing prompt.' }
  }

  if (record.prompt.length > MAX_PROMPT_LENGTH) {
    return { error: 'Prompt is too long.' }
  }

  const mode = record.mode ?? 'default'
  if (typeof mode !== 'string' || !ALLOWED_MODES.includes(mode as AllowedMode)) {
    return { error: 'Invalid mode.' }
  }

  const language = record.language ?? 'en'
  if (typeof language !== 'string' || !(language in LANGUAGE_PROMPTS)) {
    return { error: 'Invalid language.' }
  }

  return {
    value: {
      prompt: record.prompt,
      mode: mode as AllowedMode,
      language: language as AllowedLanguage,
    },
  }
}

export async function POST(req: Request) {
  const rateLimit = checkRateLimit(req)
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfter) },
      },
    )
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const validation = validateRequestBody(body)
    if (validation.error || !validation.value) {
      return NextResponse.json({ error: validation.error || 'Invalid request body.' }, { status: 400 })
    }

    const { prompt, mode, language } = validation.value
    const languagePrompt = LANGUAGE_PROMPTS[language]

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${prompt}` })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${languagePrompt}.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0].message?.content || 'No response.' })
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    console.error('Generate API error:', { errorName })
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
