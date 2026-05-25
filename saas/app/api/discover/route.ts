import { NextRequest, NextResponse } from 'next/server'

const DAILY_LIMIT = 25

type DiscoveryRequest = {
  industry?: string
  country?: string
  city?: string
  language?: string
  limit?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DiscoveryRequest

    const limit = Math.min(
      Math.max(Number(body.limit || DAILY_LIMIT), 1),
      50
    )

    const prospects = await generateProspectIdeas({
      industry: body.industry || 'small business',
      country: body.country || 'United States',
      city: body.city || '',
      language: body.language || 'English',
      limit,
    })

    return NextResponse.json({
      status: 'discovered',
      count: prospects.length,
      prospects,
      note:
        'These are AI-generated prospect ideas. Review and verify before outreach.',
    })
  } catch (error) {
    console.error('Sales discovery error:', error)

    return NextResponse.json(
      { error: 'Could not discover prospects.' },
      { status: 500 }
    )
  }
}

async function generateProspectIdeas(input: Required<DiscoveryRequest>) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const prompt = `
You are the SignalBoost SaaS Prospect Discovery Agent.

Goal:
Generate a list of potential business prospects that could benefit from SignalBoost SaaS.

SignalBoost SaaS helps with:
- multilingual websites
- review collection
- podcast support
- native AI voiceovers
- video captions
- social clips
- business content
- AI-guided creation

Discovery target:
Industry: ${input.industry}
Country: ${input.country}
City: ${input.city}
Language: ${input.language}
Limit: ${input.limit}

Important rules:
- Generate realistic prospect profiles.
- Do NOT invent private personal emails.
- Prefer business/public contact patterns only.
- Use website/contact_page fields as placeholders for verification.
- These must be treated as leads to verify, not confirmed contacts.
- Respect local culture and language.
- Return only prospects that reasonably fit SignalBoost services.

Return ONLY valid JSON:

{
  "prospects": [
    {
      "company": "business name",
      "industry": "industry",
      "country": "country",
      "city": "city",
      "language": "language",
      "website": "possible website or empty string",
      "contact_page": "possible contact page or empty string",
      "public_email": "",
      "fit_reason": "why this prospect may benefit from SignalBoost",
      "suggested_offer": "free website sketch / review system / podcast support / multilingual content",
      "confidence": "low | medium | high"
    }
  ]
}
`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a careful B2B prospect discovery assistant. You create prospect ideas for human review. You do not invent private personal contact information.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI discovery failed: ${body}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw)

  return Array.isArray(parsed.prospects) ? parsed.prospects : []
}
