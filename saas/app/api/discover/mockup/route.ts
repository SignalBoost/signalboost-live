import { NextRequest, NextResponse } from 'next/server'
import { getCultureProfile } from '@/lib/culture-engine'

type Prospect = {
  company?: string
  contactName?: string
  email?: string
  website?: string
  industry?: string
  country?: string
  language?: string
  notes?: string
}

export async function POST(req: NextRequest) {
  try {
    const { prospect } = await req.json()

    if (!prospect?.company) {
      return NextResponse.json(
        { error: 'Company name is required.' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is missing.' },
        { status: 500 }
      )
    }

    const culture = getCultureProfile(
      prospect.country,
      prospect.language
    )

    const prompt = `
Create a free website sketch concept for this prospect.

Prospect:
Company: ${prospect.company || ''}
Contact name: ${prospect.contactName || ''}
Website: ${prospect.website || ''}
Industry: ${prospect.industry || ''}
Country: ${prospect.country || ''}
Language: ${prospect.language || ''}
Notes: ${prospect.notes || ''}

Culture profile:
${JSON.stringify(culture, null, 2)}

Goal:
Create a personalized website concept that SignalBoost SaaS could offer as a free preview.

The sketch should include:
- homepage headline
- short subheadline
- 4 website sections
- suggested call-to-action
- suggested colors
- tone recommendation
- review strategy idea
- social/video idea
- why this business may benefit from SignalBoost

Rules:
- Make it culturally appropriate.
- Do not stereotype.
- If unsure, keep it respectful and professional.
- Keep it practical.
- Do not claim we already built the site.
- Present it as a free concept/sketch.
- Return valid JSON only.

Return JSON:

{
  "headline": "",
  "subheadline": "",
  "sections": [
    {
      "title": "",
      "description": ""
    }
  ],
  "callToAction": "",
  "colors": ["", "", ""],
  "tone": "",
  "reviewStrategy": "",
  "socialIdea": "",
  "whyItFits": ""
}
`

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are the SignalBoost Website Sketch Agent. You create culturally aware, practical website concepts for businesses. Return valid JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const body = await response.text()
      console.error('Mockup route error:', body)

      return NextResponse.json(
        { error: 'Could not generate website sketch.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content || '{}'
    const mockup = JSON.parse(raw)

    return NextResponse.json({ mockup })
  } catch (error) {
    console.error('Sales mockup error:', error)

    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
