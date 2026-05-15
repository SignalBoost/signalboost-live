import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lang = searchParams.get('lang') || 'EN'

  // Real SignalBoost ad phrases
  const phrases: Record<string, string> = {
    EN: 'Boost your reach with SignalBoost today!',
    ES: '¡Aumenta tu alcance con SignalBoost hoy!',
    PT: 'Amplie seu alcance com SignalBoost hoje!',
    PL: 'Zwiększ swój zasięg dzięki SignalBoost już dziś!',
    RU: 'Увеличьте охват с SignalBoost уже сегодня!',
    JP: '今すぐSignalBoostでリーチを拡大しましょう！',
  }

  const spokenText = phrases[lang] || phrases['EN']

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
