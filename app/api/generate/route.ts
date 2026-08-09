import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const MAX_MODE_LENGTH = 50
const MAX_LANGUAGE_LENGTH = 32

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  english: 'English',
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
  'pt-br': 'Portuguese',
  nl: 'Dutch',
  dutch: 'Dutch',
  ja: 'Japanese',
  japanese: 'Japanese',
  ko: 'Korean',
  korean: 'Korean',
  zh: 'Chinese',
  chinese: 'Chinese',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  ar: 'Arabic',
  arabic: 'Arabic',
  hi: 'Hindi',
  hindi: 'Hindi',
}

function getValidatedLanguage(value: unknown) {
  if (value === undefined) {
    return SUPPORTED_LANGUAGES.en
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length > MAX_LANGUAGE_LENGTH) {
    return null
  }

  return SUPPORTED_LANGUAGES[normalized] || null
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json()

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { prompt: rawPrompt, mode: rawMode, language: rawLanguage } = body as {
      prompt?: unknown
      mode?: unknown
      language?: unknown
    }

    if (typeof rawPrompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    const prompt = rawPrompt.trim()
    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: 'Prompt is too long.' }, { status: 400 })
    }

    const modeValue = rawMode === undefined ? 'default' : rawMode
    if (typeof modeValue !== 'string') {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    const mode = modeValue.trim()
    if (!mode || mode.length > MAX_MODE_LENGTH) {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    const language = getValidatedLanguage(rawLanguage)
    if (!language) {
      return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${prompt}` })
      }

      return NextResponse.json({ error: 'AI generation is unavailable.' }, { status: 503 })
    }

    const client = new OpenAI({ apiKey })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${language}.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0]?.message?.content || 'No response.' })
  } catch (error) {
    console.error('Generate API error:', { name: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
