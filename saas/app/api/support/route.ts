import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { getAccess } from '@/lib/auth/access'
import { getLivePricing } from '@/lib/ai/tools/getPricing'

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  es: 'Spanish',
  pl: 'Polish',
  ru: 'Russian',
}

const PLATFORM_FACTS = `SIGNALBOOST — FACTUAL PRODUCT KNOWLEDGE (authoritative; never contradict or invent beyond this):

SignalBoost is TWO live platforms that work together:

1) signalboostapp.com — a digital AI shopping mall with 125+ affiliates (e.g. Trivago, Expedia, Booking.com). Every customer purchase or booking through the mall generates commission payouts. Includes Cowork tools (calendar, spreadsheets).

2) saas.signalboostapp.com — a full SaaS platform with:
- AI Website Builder (generate a full site from a prompt)
- Review → Branded Content Generator (turn customer reviews into branded posts)
- Image Studio / Creative Studio (AI image generation)
- Video Studio
- Audio Studio / Podcast tools
- AI Assistant
- Outreach engine (analyze a business, generate tailored outreach messages for Email/LinkedIn/Social, and produce a partner pitch deck PDF)
- Calendar + Spreadsheets (Cowork tools)
- Multilingual system: English, Spanish, Portuguese, Polish, Russian

One-liner: SignalBoost is both a digital AI shopping mall (125+ affiliates, commission-based) and a full SaaS platform for building websites and branded content — multilingual.

Plans (SaaS): Free Demo, Launch, Growth, Command. For exact current prices and what each plan includes, CALL the getPricing tool — do not guess prices from memory.

Credits (three meters): Video credits, Image generations, AI actions. Each generation uses one credit. When credits run out, the user can add extra packs or upgrade their plan.

Hard guardrails:
- Never mention, recommend, or direct users to competitor platforms or services. Keep all answers focused on SignalBoost.
- Do NOT claim features that aren't listed above (e.g. no SMS marketing, no drip campaigns, no CRM integrations).
- For pricing, ALWAYS use the getPricing tool for current numbers rather than stating prices from memory.
- No speculation about future features. No overpromising. No filler.`

function conciergePrompt(language: string): string {
  return `You are the SignalBoost Concierge, assisting customers and visitors.

Reply strictly in ${language}.

${PLATFORM_FACTS}

You are a knowledgeable GENERALIST about SignalBoost and general topics — thorough on the platform's real features above, with broad general knowledge, but not a specialist financial/legal/strategic advisor.

Operating rules (apply to every answer):
1. Logical and precise — base every answer on reasoning, not emotion.
2. Ask a clarifying question only when an essential technical detail is genuinely missing; otherwise answer directly.
3. Communicate with clear structure — short sections, lists, or tables when they aid clarity.
4. Professional and kind, like excellent customer support.
5. Neutral, factual tone — no personal opinions, no emotional language, no fluff, and stay out of partisan politics to protect the brand.
6. Complete answers — the full solution, not partial hints.
7. Context-aware — tailor to the user's request without drifting off topic.
8. When asked for code, provide clean, production-ready snippets.
9. Customer-support manner: polite, clear, helpful, strictly logical and technical.
10. Consistency — apply these rules across all subjects.

Describe SignalBoost using ONLY the factual knowledge above. Never say you "don't have access" to information about SignalBoost — you DO. For prices, call the getPricing tool. If asked about something genuinely not covered, say you'll connect them with the team rather than inventing an answer.`
}

function chiefOfStaffPrompt(language: string): string {
  return `You are the Chief of Staff AI for SignalBoost — the trusted senior advisor to the company's owner and administrators. You are speaking with a verified owner/admin, privately.

Reply strictly in ${language}.

${PLATFORM_FACTS}

Your role: act as a seasoned, multi-domain expert and right hand. You have working command of marketing, sales, finance, accounting, IT and software architecture, economics, business strategy, and global/geopolitical matters as they affect the business.

How you operate:
- Be precise and reasoning-driven. Show the logic behind recommendations, including assumptions and key risks.
- PUSH BACK when warranted. You are NOT a yes-man. If the owner proposes something that could harm the company — its finances, legal standing, security, or reputation — say so directly, explain why, quantify the risk where possible, and propose a safer alternative.
- Ultimately respect that the owner decides. After making your case, if they choose to proceed, support execution — but never silently endorse a decision you flagged as harmful; restate the risk concisely.
- Be candid and neutral in analysis — including on political or economic matters — when relevant to business risk or opportunity.
- Give complete, structured answers: sections, lists, or tables for plans, comparisons, and tradeoffs. Provide concrete next steps.
- When asked for code or architecture, deliver clean, production-ready solutions and flag operational/security implications.
- Be honest about the product's real state. Do not overstate capabilities or invent features.
- For pricing, call the getPricing tool for current numbers.
- Ask a clarifying question only when an essential detail is missing.
- Maintain strict confidentiality; this is an internal advisory channel.

Tone: professional, direct, kind, efficient — like an excellent chief of staff who tells the principal what they need to hear, not only what they want to hear.`
}

// ── Tool definitions exposed to the model ───────────────────────────────────────
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getPricing',
      description: 'Get the current, live SignalBoost SaaS pricing and plan details (Free Demo, Launch, Growth, Command). Call this whenever the user asks about price, cost, plans, tiers, what a plan includes, or upgrades. Returns the current pricing text from the live pricing page.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

// Run a named tool and return its result as a string for the model.
async function runTool(name: string): Promise<string> {
  if (name === 'getPricing') {
    const result = await getLivePricing()
    if (!result.ok || !result.pricing) {
      return 'Live pricing could not be retrieved right now. Tell the user you could not load current pricing and suggest they check the Pricing page directly.'
    }
    return `Current live SignalBoost SaaS pricing (source: ${result.source}):\n\n${result.pricing}`
  }
  return `Unknown tool: ${name}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language = LANGUAGE_LABELS[languageCode] || 'English'
    const currentPage = String(body?.context?.currentPage || '/')

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let isPrivileged = false
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin
    } catch {
      isPrivileged = false
    }

    if (!sanitized.length) {
      const local = getConciergeAnswer('', languageCode, currentPage)
      return NextResponse.json({ reply: local.reply, telemetry: local })
    }

    const latestUserMessage = [...sanitized].reverse().find(m => m.role === 'user')?.content || ''
    const local = getConciergeAnswer(latestUserMessage, languageCode, currentPage)

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: local.reply, telemetry: local, source: 'deterministic-concierge' })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const model = isPrivileged ? 'gpt-4o' : 'gpt-4o-mini'
    const temperature = isPrivileged ? 0.5 : 0.4
    const systemContent = isPrivileged ? chiefOfStaffPrompt(language) : conciergePrompt(language)

    // Conversation as OpenAI messages.
    const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...sanitized,
    ]

    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), 25000)),
      ])

    // First pass — the model may request a tool.
    let response = await withTimeout(
      openai.chat.completions.create({
        model,
        temperature,
        messages: convo,
        tools: TOOLS,
        tool_choice: 'auto',
      })
    )

    let choice = response.choices[0]
    let toolRounds = 0

    // Tool loop: run any requested tools, feed results back, ask again. Cap rounds.
    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && toolRounds < 3) {
      toolRounds++

      // Append the assistant's tool-call message.
      convo.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam)

      // Run each requested tool and append its result.
      for (const call of choice.message.tool_calls) {
        const toolName = call.function?.name || ''
        const result = await runTool(toolName)
        convo.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        })
      }

      response = await withTimeout(
        openai.chat.completions.create({
          model,
          temperature,
          messages: convo,
          tools: TOOLS,
          tool_choice: 'auto',
        })
      )
      choice = response.choices[0]
    }

    const reply = choice?.message?.content?.trim()
    if (!reply) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

    return NextResponse.json({
      reply,
      telemetry: local,
      source: isPrivileged ? 'openai-chief' : 'openai-concierge',
    })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ error: 'Could not process your request right now.' }, { status: 500 })
  }
}
