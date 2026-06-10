import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian',
}

// Translates every string value (including inside arrays) of a JSON object
// into the target language, preserving the exact shape. Used to localize
// user-generated content (podcast sketches, site copy) to the UI language.
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const content = body?.content
    const targetLang = String(body?.targetLang || '').toLowerCase()
    const langName = LANG_NAMES[targetLang]

    if (!content || typeof content !== 'object') {
      return NextResponse.json({ ok: false, error: 'content must be a JSON object' }, { status: 400 })
    }
    if (!langName) {
      return NextResponse.json({ ok: false, error: 'targetLang must be one of en, es, pt, pl, ru' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI backend is not configured.' }, { status: 500 })

    const payload = JSON.stringify(content).slice(0, 12000)
    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate every string value in the JSON object the user provides into ${langName}, including strings inside arrays. Keep keys, structure, numbers, booleans, and URLs EXACTLY as they are. Preserve proper nouns and brand names. Respond with ONLY the translated JSON object — no markdown fences, no commentary.`,
        },
        { role: 'user', content: payload },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim() || ''
    const clean = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim()

    let translated: unknown
    try { translated = JSON.parse(clean) } catch {
      return NextResponse.json({ ok: false, error: 'Translation produced invalid JSON.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, translated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Translation failed.' }, { status: 500 })
  }
}
