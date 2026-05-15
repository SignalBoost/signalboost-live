import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getLatestAdCopy } from '@/lib/ads'  // <-- your DB/API helper

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lang = searchParams.get('lang') || 'EN'

  // 🔎 Fetch dynamic ad text from DB/API
  const adText = await getLatestAdCopy(lang)

  const response = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: adText,
  })

  const buffer = Buffer.from(await response.arrayBuffer())

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
    },
  })
}
