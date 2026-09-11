import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const ALLOWED_MODES = ['default'] as const
const ALLOWED_MODE_SET = new Set<string>(ALLOWED_MODES)
const LANGUAGE_INSTRUCTIONS = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
} as const
const ALLOWED_FIELDS = new Set(['prompt', 'mode', 'language'])
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 10
const RATE_LIMIT_MAX_ENTRIES = 1000

type AllowedMode = (typeof ALLOWED_MODES)[number]
type AllowedLanguage = keyof typeof LANGUAGE_INSTRUCTIONS

type ValidGenerateRequest = {
  prompt: string
  mode: AllowedMode
  language: AllowedLanguage
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

function validateRequestBody(body: unknown): { data: ValidGenerateRequest } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request body.' }
  }

  const record = body as Record<string, unknown>

  for (const field of Object.keys(record)) {
    if (!ALLOWED_FIELDS.has(field)) {
      return { error: 'Invalid request field.' }
    }
  }

  if (typeof record.prompt !== 'string' || record.prompt.trim().length === 0) {
    return { error: 'Missing prompt.' }
  }

  if (record.prompt.length > MAX_PROMPT_LENGTH) {
    return { error: 'Prompt is too long.' }
  }

  const mode = record.mode === undefined ? 'default' : record.mode
  if (typeof mode !== 'string' || !ALLOWED_MODE_SET.has(mode)) {
    return { error: 'Invalid mode.' }
  }

  const language = record.language === undefined ? 'en' : record.language
  if (typeof language !== 'string' || !(language in LANGUAGE_INSTRUCTIONS)) {
    return { error: 'Invalid language.' }
  }

  return {
    data: {
      prompt: record.prompt,
      mode: mode as AllowedMode,
      language: language as AllowedLanguage,
    },
  }
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim()
    if (firstForwardedIp) {
      return firstForwardedIp
    }
  }

  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function checkRateLimit(key: string): { limited: false } | { limited: true; retryAfterSeconds: number } {
  const now = Date.now()

  if (rateLimitStore.size > RATE_LIMIT_MAX_ENTRIES) {
    for (const [storedKey, entry] of rateLimitStore) {
      if (entry.resetAt <= now) {
        rateLimitStore.delete(storedKey)
      }
    }
  }

  const entry = rateLimitStore.get(key)
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { limited: false }
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { limited: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count += 1
  return { limited: false }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const validation = validateRequestBody(body)

    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { prompt, mode, language } = validation.data
    const rateLimit = checkRateLimit(getClientIp(req))

    if (rateLimit.limited) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${prompt}` })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${LANGUAGE_INSTRUCTIONS[language]}.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0].message?.content || 'No response.' })
  } catch {
    console.error('Generate API error:', { code: 'generation_failed' })
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
