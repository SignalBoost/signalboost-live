import OpenAI from 'openai'
import { NextResponse } from 'next/server'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

export async function POST(req: Request) {
  try {
    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured.' },
        { status: 500 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Please upload an audio or video file.' },
        { status: 400 }
      )
    }

    const transcript = await openai.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
    })

    return NextResponse.json({
      text: transcript.text,
    })
  } catch (error) {
    console.error('Podcast transcript error:', error)

    return NextResponse.json(
      { error: 'Could not transcribe episode.' },
      { status: 500 }
    )
  }
}
