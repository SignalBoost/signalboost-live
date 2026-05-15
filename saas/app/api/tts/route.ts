import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const text = searchParams.get('text') || 'This is the future of marketing!'
  const lang = searchParams.get('lang') || 'EN'

  // Map language codes to text
  const phrases: Record<string, string> = {
    EN: 'This is the future of marketing!',
    ES: '¡Este es el futuro del marketing!',
    PT: 'Este é o futuro do marketing!',
    PL: 'To jest przyszłość marketingu!',
    RU: 'Это будущее маркетинга!',
    JP: 'これはマーケティングの未来です！',
  }

  const spokenText = phrases[lang] || text

  const response = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: spokenText,
  })

  const buffer = Buffer.from(await response.arrayBuffer())

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
    },
  })
}
