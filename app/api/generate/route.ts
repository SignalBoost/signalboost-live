import { NextResponse } from 'next/server'
import { getAiProviderAdapter } from '@/lib/ai/adapters'

export async function POST(req: Request) {
  try {
    const { prompt, mode = 'default', language = 'en', provider } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    const adapter = getAiProviderAdapter(provider)
    const result = await adapter.generateWebsite({
      prompt: prompt.trim(),
      mode,
      language,
    })

    return NextResponse.json({
      result: result.text,
      provider: result.provider,
      model: result.model,
    })
  } catch (error) {
    console.error('Generate API error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }
}
