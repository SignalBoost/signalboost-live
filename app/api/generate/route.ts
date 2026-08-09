import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const MAX_MODE_LENGTH = 50

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  english: 'English',
  'en-us': 'English',
  'en-gb': 'English',
  es: 'Spanish',
  spanish: 'Spanish',
  fr: 'French',
  french: 'French',
  de: 'German',
  german: 'German',
  it: 'Italian',
  italian: 'Italian',
  pt: 'Portuguese',
  portuguese: 'Portuguese',
  nl: 'Dutch',
  dutch: 'Dutch',
  ja: 'Japanese',
  japanese: 'Japanese',
  ko: 'Korean',
  korean: 'Korean',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  'zh-tw': 'Chinese',
  chinese: 'Chinese',
}

function normalizeMode(mode: unknown) {
  if (mode === undefined) {
    return 'default'
  }

  if (typeof mode !== 'string') {
    return null
  }

  const trimmedMode = mode.trim()
  if (!trimmedMode || trimmedMode.length > MAX_MODE_LENGTH || !/^[A-Za-z0-9 _.-]+$/.test(trimmedMode)) {
    return null
  }

  return trimmedMode
}

function normalizeLanguage(language: unknown) {
  if (language === undefined) {
    return SUPPORTED_LANGUAGES.en
  }

  if (typeof language !== 'string') {
    return null
  }

  const normalizedLanguage = language.trim().toLowerCase()
  if (!normalizedLanguage) {
    return null
  }

  return SUPPORTED_LANGUAGES[normalizedLanguage] || null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const requestBody = body as Record<string, unknown>
    const prompt = requestBody.prompt

    if (prompt === undefined || prompt === null || prompt === '') {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    if (typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt must be a string.' }, { status: 400 })
    }

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: 'Prompt is too long.' }, { status: 400 })
    }

    const mode = normalizeMode(requestBody.mode)
    if (!mode) {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    const language = normalizeLanguage(requestBody.language)
    if (!language) {
      return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${trimmedPrompt}` })
      }

      return NextResponse.json({ error: 'Generation service unavailable.' }, { status: 503 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${language}.`,
        },
        { role: 'user', content: trimmedPrompt },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0].message?.content || 'No response.' })
  } catch (error) {
    const errorType = error instanceof Error ? error.name : typeof error
    console.error('Generate API error:', { errorType })
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
