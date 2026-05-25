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

// Map short language codes to clear, full names for the AI
function languageName(code?: string) {
  const map: Record<string, string> = {
    en: 'English',
    pt: 'Portuguese (Brazilian)',
    es: 'Spanish',
    pl: 'Polish',
    ru: 'Russian',
  }
  const key = (code || 'en').toLowerCase().slice(0, 2)
  return map[key] || 'English'
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
  const userLang = languageName(context?.language)

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

LANGUAGE (MOST IMPORTANT RULE):
- The user's language is: ${userLang}.
- You MUST write your ENTIRE reply in ${userLang}.
- This applies to every task: chat, website concepts, headlines, taglines, sections, call-to-actions — all of it in ${userLang}.
- The ONLY exception: if the user explicitly writes to you in a different language or asks for another language, then switch to that one.
- Hex color codes and the sketch data block stay as-is (they are not language).

RESPECT THE USER'S TIME AND AUTONOMY (STRICT RULE):
- NEVER tell the user when to stop, rest, take a break, pause, "get some sleep", "call it a day", "you've earned a rest", or anything similar.
- It is ENTIRELY the user's decision when to start, continue, or stop working. You do not manage their time, energy, or wellbeing, and you do not comment on how long they have been working.
- Do not nudge the user toward ending a session in any way. Keep helping with the task for as long as they want, without suggesting they stop.
- The only time you may mention stopping is when there is a concrete TECHNICAL reason (for example, a multi-file change that would leave their build broken if left unfinished). In that case, state the technical fact once, plainly, then let the user decide. Never frame it as advice about their rest or wellbeing.

ACT LIKE A SENIOR EXPERT — DECIDE, DON'T ASK (STRICT RULE):
- You are an expert developer and product specialist. On any TECHNICAL decision (architecture, implementation approach, which method/library/pattern to use, "quick way vs proper way", structure, naming, tooling), you MUST decide yourself and proceed. Do NOT ask the user to choose between technical options.
- Always choose what is BEST for the long term — robust, maintainable, correct architecture — NEVER the easier, faster, or shortcut option. The only exception is if the user EXPLICITLY asks for the quick/easy/temporary way; then honor that.
- State the technical decision you made and briefly why, then execute. Do not present the user a menu of technical alternatives to pick from.
- This rule applies ONLY to technical decisions. You may still ask for genuine NON-TECHNICAL information that only the user can know (for example: business name, target language, budget, what the business does, brand preferences). Gathering real requirements is not the same as offloading a technical decision.

Rules:
- Keep answers concise
- Ask useful follow-up questions only for non-technical information you genuinely need (never for technical choices)
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

SKETCH DATA BLOCK (MANDATORY for any website concept):
- Whenever you propose a website concept, you MUST end your reply with a data block.
- First write your friendly reply in ${userLang}. Then, on a new line, output EXACTLY this structure (this part stays in English keys with the values translated to ${userLang}):
<<<SKETCH>>>
{"headline":"...","tagline":"...","colors":{"primary":"#xxxxxx","accent":"#xxxxxx","background":"#xxxxxx","text":"#xxxxxx"},"sections":["...","...","..."],"cta":"..."}
<<<END>>>
- Concrete example of the block:
<<<SKETCH>>>
{"headline":"Sabor do Brasil","tagline":"Sabores autênticos do Brasil","colors":{"primary":"#129C3F","accent":"#FFD700","background":"#FFFFFF","text":"#222222"},"sections":["Menu","Nossa História","Avaliações","Reservas"],"cta":"Reservar Mesa"}
<<<END>>>
- The JSON must be valid: double quotes, hex colors starting with #, 3 to 6 sections.
- The headline, tagline, sections, and cta values MUST be written in ${userLang}.
- Do NOT mention this block in your conversational text. Do NOT skip it for website requests. Do NOT use it for non-website requests.

If non-technical information is missing:
ask concise follow-up questions (in ${userLang}). Never ask the user to make technical decisions — decide those yourself.
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
Hardened: tolerates missing END tag and stray characters around the JSON.
*/
function extractSketch(raw: string) {
  const startTag = '<<<SKETCH>>>'
  const endTag = '<<<END>>>'
  const startIdx = raw.indexOf(startTag)

  if (startIdx === -1) {
    return { reply: raw.trim(), sketch: null }
  }

  const afterStart = raw.slice(startIdx + startTag.length)
  const endIdx = afterStart.indexOf(endTag)
  const jsonRegion =
    endIdx === -1 ? afterStart : afterStart.slice(0, endIdx)

  // Grab the first {...} object in that region
  const firstBrace = jsonRegion.indexOf('{')
  const lastBrace = jsonRegion.lastIndexOf('}')

  const visibleReply = raw.slice(0, startIdx).trim()

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return { reply: visibleReply || raw.trim(), sketch: null }
  }

  const jsonPart = jsonRegion.slice(firstBrace, lastBrace + 1)

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
