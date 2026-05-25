import { NextRequest, NextResponse } from 'next/server'

type Prospect = {
  id: string
  company?: string
  contact_name?: string
  email?: string
  website?: string
  industry?: string
  country?: string
  language?: string
  notes?: string
}

const DAILY_LIMIT = 10

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    const cronSecret = process.env.SALES_CRON_SECRET

    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const prospects = await getDailyProspects()

    const results = []

    for (const prospect of prospects) {
      try {
        const draft = await generateSalesDraft(prospect)

        await updateProspect(prospect.id, {
          status: 'draft_ready',
          draft_subject: draft.subject,
          draft_body: draft.body,
          draft_generated_at: new Date().toISOString(),
          last_error: null,
        })

        results.push({
          id: prospect.id,
          company: prospect.company,
          status: 'draft_ready',
        })
      } catch (error) {
        await updateProspect(prospect.id, {
          status: 'draft_failed',
          last_error:
            error instanceof Error ? error.message : 'Unknown error',
        })

        results.push({
          id: prospect.id,
          company: prospect.company,
          status: 'draft_failed',
        })
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error('Sales daily route error:', error)

    return NextResponse.json(
      { error: 'Sales daily job failed.' },
      { status: 500 }
    )
  }
}

async function getDailyProspects(): Promise<Prospect[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error('Supabase server credentials are missing.')
  }

  const res = await fetch(
    `${url}/rest/v1/sales_prospects?status=eq.approved&select=*&limit=${DAILY_LIMIT}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Could not load prospects: ${body}`)
  }

  return res.json()
}

async function updateProspect(
  id: string,
  data: Record<string, unknown>
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error('Supabase server credentials are missing.')
  }

  const res = await fetch(
    `${url}/rest/v1/sales_prospects?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Could not update prospect: ${body}`)
  }
}

async function generateSalesDraft(prospect: Prospect) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const prompt = buildPrompt(prospect)

  const res = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.65,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are the SignalBoost SaaS Sales Agent. You are culturally aware, respectful, professional, and human. You write sales outreach that feels local, not generic. Return valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI failed: ${body}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || '{}'

  return JSON.parse(raw) as {
    subject: string
    body: string
  }
}

function buildPrompt(prospect: Prospect) {
  const culture = getCultureGuide(
    prospect.country,
    prospect.language
  )

  return `
Create a culturally aware sales outreach email.

Goal:
Offer the prospect a free website sketch or digital presence concept so they can see what SignalBoost SaaS can do for them.

SignalBoost SaaS can help with:
- multilingual websites
- review collection
- podcast support
- native AI voiceover
- video captions
- social clips
- business content
- AI-guided creation

Important:
Culture must influence the message.
This applies to written content, audio, video, website sketches, reviews, and all future generated assets.

Prospect:
Company: ${prospect.company || ''}
Contact name: ${prospect.contact_name || ''}
Email: ${prospect.email || ''}
Website: ${prospect.website || ''}
Industry: ${prospect.industry || ''}
Country: ${prospect.country || ''}
Language: ${prospect.language || ''}
Notes: ${prospect.notes || ''}

Cultural communication guidance:
${culture}

Sales rules:
- Be respectful.
- Be human.
- Do not sound like spam.
- Do not overpromise.
- Do not pretend we already know them personally.
- Offer a free sketch/concept.
- Invite a reply.
- Mention saassales@signalboostapp.com as the reply contact.
- If the culture prefers formality, be formal.
- If the culture prefers warmth, be warmer.
- Keep it concise.

Return ONLY valid JSON:

{
  "subject": "subject line",
  "body": "full email body"
}
`
}

function getCultureGuide(
  country?: string,
  language?: string
) {
  const c = `${country || ''} ${language || ''}`.toLowerCase()

  if (
    c.includes('poland') ||
    c.includes('polski') ||
    c.includes('polish')
  ) {
    return `
Polish business communication:
- Professional and clear.
- Avoid exaggerated hype.
- Be respectful and practical.
- Show concrete value.
- A slightly formal tone is better than sounding too casual.
`
  }

  if (
    c.includes('brazil') ||
    c.includes('brasil') ||
    c.includes('portuguese')
  ) {
    return `
Brazilian business communication:
- Warm and relationship-oriented.
- Friendly but still professional.
- Show interest in the business.
- A human tone matters.
- Avoid being cold or overly transactional.
`
  }

  if (
    c.includes('russia') ||
    c.includes('russian') ||
    c.includes('russkiy')
  ) {
    return `
Russian business communication:
- Formal, respectful, and practical.
- Avoid exaggerated enthusiasm.
- Explain value clearly.
- Be direct but polite.
- Use a serious professional tone.
`
  }

  if (
    c.includes('mexico') ||
    c.includes('peru') ||
    c.includes('colombia') ||
    c.includes('argentina') ||
    c.includes('spanish') ||
    c.includes('latam')
  ) {
    return `
Latin American business communication:
- Warm, respectful, and personable.
- Relationship matters.
- Avoid sounding robotic.
- Be clear about value.
- Use friendly professionalism.
`
  }

  if (
    c.includes('united states') ||
    c.includes('usa') ||
    c.includes('us') ||
    c.includes('english')
  ) {
    return `
US business communication:
- Concise, benefit-driven, and direct.
- Get to the value quickly.
- Clear call to action.
- Friendly but not too long.
`
  }

  return `
Default international business communication:
- Respectful, neutral, and professional.
- Do not assume culture if unclear.
- Avoid slang.
- Make the value concrete.
- Keep the message human and concise.
`
}
