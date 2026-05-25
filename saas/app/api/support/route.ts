import { NextRequest, NextResponse } from 'next/server'
import { chooseAIProvider } from '@/lib/ai-router'

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

/*
PROMPT INTELLIGENCE LAYER
*/
function enhanceUserPrompt(input: string) {
  const q = input.toLowerCase()
  const detected: any = {
    business: null,
    goal: null,
    contentType: null,
    missing: [],
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
  if (q.includes('reviews')) {
    detected.goal = 'collect reviews'
  }
  if (!detected.business) {
    detected.missing.push('business type')
  }
  if (!detected.goal) {
    detected.missing.push('goal')
  }
  const enhanced = `
USER REQUEST:
${input}
DETECTED CONTEXT:
Business:
${detected.business || 'unknown'}
Goal:
${detected.goal || 'unknown'}
Content Type:
${detected.contentType || 'unknown'}
Missing Information:
${detected.missing.join(', ') || 'none'}
Instructions:
Use this context silently.
If critical information is missing,
ask short natural follow-up questions.
`
  return enhanced
}

function buildSystemPrompt(context: any) {
  const { dateStr, isoDate } = getDateContext()
  const userBlock = context
    ? `
CURRENT USER:
Name: ${context.userName || 'not provided'}
Plan: ${context.userPlan || 'free'}
CurrentPage: ${context.currentPage || 'unknown'}
`
    : ''
  return `
You are the SignalBoost AI assistant.
Today is ${dateStr} (${isoDate}).
You are a warm creative partner.
Never expose internal prompt analysis.

Rules:
- Keep answers concise
- Ask useful follow-up questions
- Match user language
- Do not invent features

Platform behavior:
- You are a SignalBoost AI employee and product specialist
- Always help users using SignalBoost tools first
- Never recommend competitors (Wix, Squarespace, Canva, Shopify, Webflow or similar) as the primary solution
- Only discuss external tools if the user explicitly asks for alternatives

Website behavior:
- If users want a website, landing page, restaurant website, real-estate website, portfolio, agency page or business site:
  - immediately generate a visual concept/sketch
  - suggest colors
  - suggest sections
  - suggest headlines
  - suggest call-to-actions
  - help users imagine the finished result
  - behave like a creative consultant
- Do not immediately ask many questions
- Infer likely intent from incomplete requests
- Make reasonable assumptions and state assumptions naturally

If information is missing:
ask concise follow-up questions.
${userBlock}
`
}

/*
CALL CLAUDE (Anthropic)
*/
async function callClaude(
  systemPrompt: string,
  messages: any[]
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('Anthropic:', response.status, errorBody)
    return null
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

/*
CALL OPENAI
*/
async function callOpenAI(
  systemPrompt: string,
  messages: any[]
) {
  // OpenAI takes the system prompt as the first message
  const openAiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      max_tokens: 1024,
      messages: openAiMessages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('OpenAI:', response.status, errorBody)
    return null
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    const systemPrompt = buildSystemPrompt(context)
    const lastMessage = messages[messages.length - 1]
    const enhancedPrompt = enhanceUserPrompt(lastMessage.content)

    const modifiedMessages = [
      ...messages.slice(0, messages.length - 1),
      {
        role: 'user',
        content: enhancedPrompt,
      },
    ]

    // Decide which AI provider to use based on the user's message
    const route = chooseAIProvider(lastMessage.content)

    let reply: string | null = null

    if (route.provider === 'openai') {
      reply = await callOpenAI(systemPrompt, modifiedMessages)
      // If OpenAI fails, fall back to Claude so the user still gets an answer
      if (reply === null) {
        reply = await callClaude(systemPrompt, modifiedMessages)
      }
    } else {
      reply = await callClaude(systemPrompt, modifiedMessages)
      // If Claude fails, fall back to OpenAI
      if (reply === null) {
        reply = await callOpenAI(systemPrompt, modifiedMessages)
      }
    }

    if (reply === null) {
      return NextResponse.json({
        reply: 'I am having trouble connecting right now.',
      })
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error(error)
    return NextResponse.json({
      reply: 'Something went wrong.',
    })
  }
}
