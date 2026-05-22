import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ClipRequest = {
  transcript?: string
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured.' },
        { status: 500 }
      )
    }

    const body = (await req.json()) as ClipRequest
    const transcript = body.transcript?.trim() || ''

    if (!transcript) {
      return NextResponse.json(
        { error: 'Please generate a transcript first.' },
        { status: 400 }
      )
    }

    const prompt = `
You are SignalBoost Clip Agent.

Analyze this podcast transcript and identify the best short-form clip opportunities.

Transcript:
${transcript}

Return ONLY valid JSON with this exact shape:

{
  "clips": [
    {
      "title": "short clip title",
      "hook": "first line or hook",
      "whyItWorks": "why this moment could work as a short clip",
      "suggestedCaption": "caption for TikTok/Reels/Shorts"
    }
  ]
}

Return 5 clips maximum.
Keep language direct and useful.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.65,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You find useful short-form content opportunities from podcast transcripts. Return JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const result = JSON.parse(raw)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Podcast clips error:', error)

    return NextResponse.json(
      { error: 'Could not generate clip ideas.' },
      { status: 500 }
    )
  }
}
