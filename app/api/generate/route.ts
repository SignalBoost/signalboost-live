import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const MAX_MODE_LENGTH = 50

const ALLOWED_LANGUAGES: Record<string, string> = {
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
  nl: 'Dutch',
  dutch: 'Dutch',
  sv: 'Swedish',
  swedish: 'Swedish',
  no: 'Norwegian',
  norwegian: 'Norwegian',
  da: 'Danish',
  danish: 'Danish',
  fi: 'Finnish',
  finnish: 'Finnish',
  pl: 'Polish',
  polish: 'Polish',
  cs: 'Czech',
  czech: 'Czech',
  hu: 'Hungarian',
  hungarian: 'Hungarian',
  ro: 'Romanian',
  romanian: 'Romanian',
  tr: 'Turkish',
  turkish: 'Turkish',
  ja: 'Japanese',
  japanese: 'Japanese',
  ko: 'Korean',
  korean: 'Korean',
  zh: 'Chinese',
  chinese: 'Chinese',
  ar: 'Arabic',
  arabic: 'Arabic',
  hi: 'Hindi',
  hindi: 'Hindi',
  id: 'Indonesian',
  indonesian: 'Indonesian',
  vi: 'Vietnamese',
  vietnamese: 'Vietnamese',
}

type GenerateRequestBody = {
  prompt?: unknown
  mode?: unknown
  language?: unknown
}

function normalizePrompt(value: unknown): { value?: string; error?: string } {
  if (typeof value !== 'string') {
    return { error: 'Missing prompt.' }
  }

  const prompt = value.trim()

  if (!prompt) {
    return { error: 'Missing prompt.' }
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { error: 'Prompt is too long.' }
  }

  return { value: prompt }
}

function normalizeMode(value: unknown): string | null {
  const rawMode = value ?? 'default'

  if (typeof rawMode !== 'string') {
    return null
  }

  const mode = rawMode.trim()

  if (!mode || mode.length > MAX_MODE_LENGTH || !/^[a-zA-Z0-9 _.-]+$/.test(mode)) {
    return null
  }

  return mode
}

function normalizeLanguage(value: unknown): string | null {
  const rawLanguage = value ?? 'en'

  if (typeof rawLanguage !== 'string') {
    return null
  }

  const languageKey = rawLanguage.trim().toLowerCase()

  if (!languageKey || languageKey.length > 32) {
    return null
  }

  return ALLOWED_LANGUAGES[languageKey] ?? null
}

function isMockGenerationAllowed() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSanitizedErrorMetadata(error: unknown, requestId: string) {
  if (error && typeof error === 'object') {
    const maybeError = error as { name?: unknown; status?: unknown; code?: unknown; type?: unknown }

    return {
      requestId,
      name: typeof maybeError.name === 'string' ? maybeError.name : 'Error',
      status: typeof maybeError.status === 'number' ? maybeError.status : undefined,
      code: typeof maybeError.code === 'string' ? maybeError.code : undefined,
      type: typeof maybeError.type === 'string' ? maybeError.type : undefined,
    }
  }

  return { requestId, name: 'UnknownError' }
}

export async function POST(req: Request) {
  const requestId = createRequestId()

  try {
    let body: GenerateRequestBody

    try {
      const parsedBody = await req.json()

      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
      }

      body = parsedBody as GenerateRequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const promptResult = normalizePrompt(body.prompt)

    if (promptResult.error || !promptResult.value) {
      return NextResponse.json({ error: promptResult.error }, { status: 400 })
    }

    const mode = normalizeMode(body.mode)

    if (!mode) {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    const language = normalizeLanguage(body.language)

    if (!language) {
      return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      if (isMockGenerationAllowed()) {
        return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${promptResult.value}` })
      }

      console.error('Generate API configuration error:', { requestId, code: 'OPENAI_API_KEY_MISSING' })
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 })
    }

    const client = new OpenAI({ apiKey })
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${language}.`,
        },
        { role: 'user', content: promptResult.value },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0]?.message?.content || 'No response.' })
  } catch (error) {
    console.error('Generate API error:', getSanitizedErrorMetadata(error, requestId))
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
