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

SKETCH DATA BLOCK (very important):
- ONLY when you are proposing a website concept, append a machine-readable block at the very END of your reply.
- Write your normal friendly reply first, then on a new line output exactly this format:
<<<SKETCH>>>
{"headline":"...","tagline":"...","colors":{"primary":"#xxxxxx","accent":"#xxxxxx","background":"#xxxxxx","text":"#xxxxxx"},"sections":["...","..."],"cta":"..."}
<<<END>>>
- The JSON must be valid: double quotes, hex colors starting with #, 3-6 sections.
- Do NOT mention this block in your conversational text. Do NOT use it for non-website requests.

If information is missing:
ask concise follow-up questions.
${userBlock}
`
}

/*
CALL CLAUDE (Anthropic)
*/
async function callClaude(systemPrompt: string, messages: any[]) {
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
async function callOpenAI(systemPrompt: string, messages: any[]) {
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

/*
SPLIT THE RAW REPLY INTO: visible chat text + parsed sketch (if any)
*/
function extractSketch(raw: string) {
  const startTag = '<<<SKETCH>>>'
  const endTag = '<<<END>>>'
  const startIdx = raw.indexOf(startTag)
  const endIdx = raw.indexOf(endTag)

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { reply: raw.trim(), sketch: null }
  }

  const jsonPart = raw.slice(startIdx + startTag.length, endIdx).trim()
  const visibleReply = raw.slice(0, startIdx).trim()

  let sketch = null
  try {
    sketch = JSON.parse(jsonPart)
  } catch {
    sketch = null
  }

  return { reply: visibleReply || raw.trim(), sketch }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const systemPrompt = buildSystemPrompt(context)
    const lastMessage = messages[messages.length - 1]
    const enhancedPrompt = enhanceUserPrompt(lastMessage.content)

    const modifiedMessages = [
      ...messages.slice(0, messages.length - 1),
      { role: 'user', content: enhancedPrompt },
    ]

    const route = chooseAIProvider(lastMessage.content)

    let raw: string | null = null

    if (route.provider === 'openai') {
      raw = await callOpenAI(systemPrompt, modifiedMessages)
      if (raw === null) raw = await callClaude(systemPrompt, modifiedMessages)
    } else {
      raw = await callClaude(systemPrompt, modifiedMessages)
      if (raw === null) raw = await callOpenAI(systemPrompt, modifiedMessages)
    }

    if (raw === null) {
      return NextResponse.json({ reply: 'I am having trouble connecting right now.', sketch: null })
    }

    const { reply, sketch } = extractSketch(raw)

    return NextResponse.json({ reply, sketch })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ reply: 'Something went wrong.', sketch: null })
  }
}
