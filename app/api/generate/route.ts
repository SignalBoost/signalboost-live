import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_PROMPT_LENGTH = 4000
const MAX_MODE_LENGTH = 50

const MODE_PATTERN = /^[A-Za-z0-9 _.-]+$/

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  'en-us': 'English',
  'en-gb': 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  'pt-br': 'Portuguese',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  tr: 'Turkish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  'zh-tw': 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
}

function createRequestId() {
  return Math.random().toString(36).slice(2, 10)
}

export async function POST(req: Request) {
  const requestId = createRequestId()

  try {
    let body: unknown

    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const requestBody = body as Record<string, unknown>
    const rawPrompt = requestBody.prompt
    const rawMode = requestBody.mode ?? 'default'
    const rawLanguage = requestBody.language ?? 'en'

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

    if (typeof rawMode !== 'string') {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    const mode = rawMode.trim()

    if (!mode || mode.length > MAX_MODE_LENGTH || !MODE_PATTERN.test(mode)) {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    }

    if (typeof rawLanguage !== 'string') {
      return NextResponse.json({ error: 'Invalid language.' }, { status: 400 })
    }

    const language = SUPPORTED_LANGUAGES[rawLanguage.trim().toLowerCase()]

    if (!language) {
      return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Generation service unavailable.' }, { status: 503 })
      }

      return NextResponse.json({ result: `SignalBoost draft (${mode}, ${language}): ${prompt}` })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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

    return NextResponse.json({ result: completion.choices[0].message?.content || 'No response.' })
  } catch (error) {
    console.error('Generate API error:', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
