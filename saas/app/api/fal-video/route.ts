import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt = body?.prompt?.trim()
    if (!prompt) return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 })

    const res = await fetch(`${req.nextUrl.origin}/api/video-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error || 'Video generation failed.' }, { status: res.status })

    return NextResponse.json(data)
  } catch (error) {
    console.error('fal-video proxy error', error)
    return NextResponse.json({ error: 'Could not generate video.' }, { status: 500 })
  }
}
