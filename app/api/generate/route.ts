import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { prompt, mode = 'default', language = 'en' } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
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
          content: `You are SignalBoost AI. Generate concise, brand-safe content for the unified Marketplace + SaaS cockpit. Respond in ${language}.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    })

    return NextResponse.json({ result: completion.choices[0].message?.content || 'No response.' })
  } catch (error) {
    console.error('Generate API error:', error)
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
