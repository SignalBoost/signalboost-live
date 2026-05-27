import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  es: 'Spanish',
  pl: 'Polish',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language = LANGUAGE_LABELS[languageCode] || 'English'

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    if (!sanitized.length) {
      return NextResponse.json({ reply: language.startsWith('Portuguese') ? 'Como posso ajudar você hoje?' : 'How can I help you today?' })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost Concierge. Reply strictly in ${language}. Be practical and brief. If user asks about features, provide actionable steps in SignalBoost dashboard.`
        },
        ...sanitized,
      ],
    })

    const reply = response.choices[0]?.message?.content?.trim()
    if (!reply) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ error: 'Could not process your request right now.' }, { status: 500 })
  }
}
