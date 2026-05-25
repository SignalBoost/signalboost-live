import { NextRequest, NextResponse } from 'next/server'

function getDateContext() {
  const now = new Date()

  return {
    dateStr: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    isoDate: now.toISOString().slice(0, 10),
  }
}

function enhanceUserPrompt(input: string) {
  const q = input.toLowerCase()

  const detected = {
    business: null as string | null,
    goal: null as string | null,
    contentType: null as string | null,
    missing: [] as string[],
  }

  if (q.includes('website') || q.includes('site')) {
    detected.contentType = 'website'
  }

  if (q.includes('podcast')) {
    detected.contentType = 'podcast'
  }

  if (q.includes('video')) {
    detected.contentType = 'video'
  }

  if (q.includes('restaurant') || q.includes('food')) {
    detected.business = 'restaurant'
  }

  if (q.includes('review') || q.includes('reviews')) {
    detected.goal = 'collect reviews'
  }

  if (!detected.business) detected.missing.push('business type')
  if (!detected.goal) detected.missing.push('goal')

  return `
USER REQUEST:
${input}

PROMPT INTELLIGENCE CONTEXT:
Business: ${detected.business || 'unknown'}
Goal: ${detected.goal || 'unknown'}
Content Type: ${detected.contentType || 'unknown'}
Missing Information: ${detected.missing.join(', ') || 'none'}

Use this silently.
If important details are missing, ask one or two short natural follow-up questions.
`
}

function chooseProvider(input: string) {
  const q = input.toLowerCase()

  if (
    q.includes('website') ||
    q.includes('marketing') ||
    q.includes('business') ||
    q.includes('podcast') ||
    q.includes('video') ||
    q.includes('creative')
  ) {
    return 'openai'
  }

  return 'anthropic'
}

function buildSystemPrompt(context: any) {
  const { dateStr, isoDate } = getDateContext()

  return `
You are the SignalBoost AI assistant.

Today is ${dateStr} (${isoDate} UTC).

You are warm, direct, practical, and creative.
You help users build websites, podcasts, marketing content, reviews, audio, video, and multilingual business assets.

Do not expose internal routing, model names, or prompt analysis.

User context:
Name: ${context?.userName || 'not provided'}
Plan: ${context?.userPlan || 'free'}
Current page: ${context?.currentPage || 'unknown'}
Language: ${context?.language || 'en'}

Rules:
- Keep answers short by default.
- Ask useful follow-up questions when needed.
- Match the user's language.
- Be beginner-friendly.
- Do not invent prices, features, or limits.
`
}

async function callOpenAI(systemPrompt: string, messages: any[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('OpenAI API error:', response.status, errorBody)
    throw new Error('OpenAI request failed')
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropic(systemPrompt: string, messages: any[]) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('Anthropic API error:', response.status, errorBody)
    throw new Error('Anthropic request failed')
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const lastMessage = messages[messages.length - 1]

    if (!lastMessage?.content) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    const systemPrompt = buildSystemPrompt(context)
    const enhancedPrompt = enhanceUserPrompt(lastMessage.content)

    const modifiedMessages = [
      ...messages.slice(0, messages.length - 1),
      {
        role: 'user',
        content: enhancedPrompt,
      },
    ]

    const provider = chooseProvider(lastMessage.content)

    let reply = ''

    try {
      if (provider === 'openai') {
        reply = await callOpenAI(systemPrompt, modifiedMessages)
      } else {
        reply = await callAnthropic(systemPrompt, modifiedMessages)
      }
    } catch (primaryError) {
      console.error('Primary AI provider failed:', primaryError)

      if (provider === 'openai') {
        reply = await callAnthropic(systemPrompt, modifiedMessages)
      } else {
        reply = await callOpenAI(systemPrompt, modifiedMessages)
      }
    }

    return NextResponse.json({
      reply,
      provider,
    })
  } catch (error) {
    console.error('Support route error:', error)

    return NextResponse.json({
      reply:
        'Something went wrong on my end. If this is urgent, you can email saassupport@signalboostapp.com and we will help you.',
    })
  }
}
