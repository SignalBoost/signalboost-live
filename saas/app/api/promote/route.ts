import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,   
})

type PromoteRequest = {
  businessName?: string
  promotion?: string
  audience?: string
  tone?: string
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: 'OPENAI_API_KEY is not configured.',
        },
        { status: 500 }
      )
    }

    const body = (await req.json()) as PromoteRequest

    const businessName =
      body.businessName?.trim() || 'the business'

    const promotion =
      body.promotion?.trim() || ''

    const audience =
      body.audience?.trim() || 'local customers'

    const tone =
      body.tone?.trim() || 'friendly'

    if (!promotion) {
      return NextResponse.json(
        {
          error: 'Please enter what you want to promote.',
        },
        { status: 400 }
      )
    }

    const prompt = `
You are SignalBoost, an AI marketing helper for small businesses.

Create a practical campaign for this business.

Business name: ${businessName}
Audience: ${audience}
Tone: ${tone}
Promotion: ${promotion}

Return ONLY valid JSON with this exact shape:

{
  "headline": "short campaign headline",
  "website": {
    "title": "website banner title",
    "body": "website banner body",
    "cta": "button text"
  },
  "social": {
    "facebook": "Facebook post",
    "instagram": "Instagram caption",
    "tiktok": "TikTok caption"
  },
  "email": {
    "subject": "email subject",
    "body": "short email body"
  },
  "video": {
    "hook": "first 3 seconds",
    "script": "short video script",
    "cta": "video call to action"
  },
  "reviewFollowUp": "short message asking happy customers for a review",
  "languageIdeas": [
    "English angle",
    "Spanish angle",
    "Portuguese angle"
  ]
}

Keep it useful, clear, and realistic for a small business owner.
Do not mention that you are an AI.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            'You create useful marketing campaigns for small businesses. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const raw =
      completion.choices[0]?.message?.content || ''

    let campaign

    try {
      campaign = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        {
          error: 'AI returned invalid JSON.',
          raw,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      campaign,
    })
  } catch (error) {
    console.error('Promote API error:', error)

    return NextResponse.json(
      {
        error: 'Could not generate campaign.',
      },
      { status: 500 }
    )
  }
}
