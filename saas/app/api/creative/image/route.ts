import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'

type CreativeImageRequest = {
  prompt?: string
  title?: string
}

export async function POST(req: Request) {
  // Auth: paid-API route — signed-in users only.
  const authedUser = await getCurrentUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }


  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured.' },
        { status: 500 }
      )
    }

    const body = (await req.json()) as CreativeImageRequest
    const prompt = String(body.prompt || '').trim()

    if (!prompt) {
      return NextResponse.json({ error: 'missing prompt' }, { status: 400 })
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        n: 1,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'image generation failed' },
        { status: 500 }
      )
    }

    const first = data.data?.[0] || {}
    const imageUrl = first.url || null
    const imageDataUrl = first.b64_json
      ? `data:image/png;base64,${first.b64_json}`
      : null

    return NextResponse.json({
      imageUrl,
      imageDataUrl,
      title: body.title || 'Creative image',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'image request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
