import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { getAccess } from '@/lib/auth/access'
import { getLivePricing } from '@/lib/ai/tools/getPricing'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics'
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { getAffiliateCount, formatAffiliatesForAI } from '@/lib/ai/tools/getAffiliateCount'
import { loadUserMemories, formatMemoriesForAI, saveUserMemory, forgetUserMemory } from '@/lib/ai/tools/userMemory'

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

const LANGUAGE_LABELS: Record<string, string> = {
  en:      'English',
  pt:      'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  es:      'Spanish',
  pl:      'Polish',
  ru:      'Russian',
}

const PLATFORM_FACTS = `SIGNALBOOST — FACTUAL PRODUCT KNOWLEDGE (authoritative; never contradict or invent beyond this):

SignalBoost is TWO live platforms that work together:

1) signalboostapp.com — a digital AI shopping mall featuring major affiliates such as Trivago, Expedia, and Booking.com. Every customer purchase or booking through the mall generates commission payouts. Includes Cowork tools (calendar, spreadsheets). For the CURRENT total number of affiliates, ALWAYS call the getAffiliateCount tool — never state a count from memory.

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

One-liner: SignalBoost is both a digital AI shopping mall (commission-based affiliate network — call getAffiliateCount for the current count) and a full SaaS platform for building websites and branded content — multilingual.

Plans (SaaS): Free Demo, Launch, Growth, Command. For exact current prices and what each plan includes, CALL the getPricing tool — do not guess prices from memory.

Credits (three meters): Video credits, Image generations, AI actions. Each generation uses one credit. When credits run out, the user can add extra packs or upgrade their plan.

Hard guardrails:
- LIVE-DATA DOCTRINE: Never state business facts — counts, prices, metrics, totals, plan details — from memory. Always fetch them live via the available tools first. If a tool fails, say live data is temporarily unavailable rather than guessing or using a remembered number.
- Never mention, recommend, or direct users to competitor platforms or services. Keep all answers focused on SignalBoost.
- Do NOT claim features that aren't listed above (e.g. no SMS marketing, no drip campaigns, no CRM integrations).
- For pricing, ALWAYS use the getPricing tool for current numbers rather than stating prices from memory.
- For affiliate/partner counts, ALWAYS use the getAffiliateCount tool rather than stating numbers from memory.
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

function chiefOfStaffPrompt(language: string, liveMetrics: string): string {
  return `You are the Chief of Staff AI for SignalBoost — the trusted senior advisor to the company's owner and administrators. You are speaking with a verified owner/admin, privately.

Reply strictly in ${language}.

${PLATFORM_FACTS}

── LIVE BUSINESS METRICS (pre-fetched from Supabase for this session) ──
${liveMetrics}
── END LIVE METRICS ──

When answering questions about users, revenue, MRR, ARR, growth, leads, or credits — use the live metrics above. They are current as of this session. Call getBusinessMetrics only if you need a refresh mid-conversation.

You also have a getExternalInfo tool that performs a LIVE WEB SEARCH. Use it whenever the owner asks about market conditions, competitors, industry trends, current prices of external services, news, regulations, or anything outside SignalBoost's internal data. Always cite source URLs from the results when making claims based on them. The competitor guardrail does NOT apply in this private channel — competitor analysis for the owner is part of your job.

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
// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOL_GET_PRICING: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getPricing',
    description: 'Get the current, live SignalBoost SaaS pricing and plan details (Free Demo, Launch, Growth, Command). Call this whenever the user asks about price, cost, plans, tiers, what a plan includes, or upgrades.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_BUSINESS_METRICS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getBusinessMetrics',
    description: 'Refresh live business metrics from Supabase: users, MRR, plan breakdown, outreach leads, credit balances. Metrics are pre-loaded at session start — call this only if the owner asks for a refresh or asks about something that may have changed during the conversation.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_EXTERNAL_INFO: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getExternalInfo',
    description: 'Perform a live web search for current external information: market data, competitor analysis, industry trends, news, regulations, prices of external services. Returns top results with titles, URLs, and snippets. Use for anything outside SignalBoost internal data that requires up-to-date facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The web search query, e.g. "AI website builder market size 2026" or "Canva pricing plans".' },
      },
      required: ['query'],
    },
  },
}

const TOOL_GET_AFFILIATE_COUNT: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getAffiliateCount',
    description: 'Get the LIVE, current number of affiliates/partners in the SignalBoost shopping mall, queried directly from the partners database. Call this whenever the user asks how many affiliates, partners, brands, or stores the platform has. Never answer affiliate counts from memory.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_REMEMBER_FACT: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'rememberFact',
    description: 'Save a LASTING fact about the user to long-term memory so future conversations remember it. Use when the user states a durable preference (language, tone, format), a fact about themselves or their business (name, industry, location), or a goal. One concise fact per call. Do NOT save passwords, payment data, or temporary details.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['preference', 'fact', 'goal'], description: 'Type of memory.' },
        content: { type: 'string', description: 'The fact to remember, short and self-contained, e.g. "Prefers replies in Polish" or "Runs a bakery in Mérida, Mexico".' },
      },
      required: ['kind', 'content'],
    },
  },
}

const TOOL_FORGET_FACT: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'forgetFact',
    description: 'Delete saved memories about the user that match a phrase. Use when the user asks you to forget something or says a saved fact is no longer true.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'A distinctive phrase from the memory to delete, e.g. "bakery" or "Polish".' },
      },
      required: ['match'],
    },
  },
}

const CONCIERGE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_AFFILIATE_COUNT,
]

const CHIEF_OF_STAFF_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_BUSINESS_METRICS,
  TOOL_GET_EXTERNAL_INFO,
  TOOL_GET_AFFILIATE_COUNT,
]

async function runTool(name: string, rawArgs: string, userId: string | null): Promise<string> {
  if (name === 'getPricing') {
    const result = await getLivePricing()
    if (!result.ok || !result.pricing) {
      return 'Live pricing could not be retrieved right now. Tell the user you could not load current pricing and suggest they check the Pricing page directly.'
    }
    return `Current live SignalBoost SaaS pricing (source: ${result.source}):\n\n${result.pricing}`
  }

  if (name === 'getBusinessMetrics') {
    const result = await getBusinessMetrics()
    if (result.ok && result.metrics) {
      return formatMetricsForAI(result.metrics)
    }
    return `Business metrics could not be retrieved: ${result.error ?? 'unknown error'}. Let the owner know and suggest checking Supabase directly.`
  }

  if (name === 'getExternalInfo') {
    let query = ''
    try { query = String(JSON.parse(rawArgs || '{}')?.query || '') } catch {}
    if (!query.trim()) {
      return 'No search query was provided. Ask the owner what they want to search for.'
    }
    const result = await getExternalInfo(query)
    if (result.ok && result.results.length) {
      return formatExternalInfoForAI(query, result.results)
    }
    return `Web search failed: ${result.error ?? 'unknown error'}. Tell the owner live external data is unavailable right now and answer from your own knowledge, clearly flagging that it may be outdated.`
  }

  if (name === 'getAffiliateCount') {
    const result = await getAffiliateCount()
    if (result.ok && result.metrics) {
      return formatAffiliatesForAI(result.metrics)
    }
    return `Live affiliate count could not be retrieved: ${result.error ?? 'unknown error'}. Tell the user the live count is temporarily unavailable instead of guessing a number.`
  }

  if (name === 'rememberFact') {
    if (!userId) {
      return 'Memory is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let kind = ''
    let memoryContent = ''
    try {
      const parsed = JSON.parse(rawArgs || '{}')
      kind = String(parsed?.kind || '')
      memoryContent = String(parsed?.content || '')
    } catch {}
    const result = await saveUserMemory(userId, kind, memoryContent)
    return result.ok
      ? `Memory saved: [${kind}] ${memoryContent}. Acknowledge briefly and naturally.`
      : `Memory could not be saved (${result.error ?? 'unknown error'}). Continue helping without mentioning technical details.`
  }

  if (name === 'forgetFact') {
    if (!userId) {
      return 'Memory is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let match = ''
    try { match = String(JSON.parse(rawArgs || '{}')?.match || '') } catch {}
    const result = await forgetUserMemory(userId, match)
    if (!result.ok) {
      return `Memories could not be deleted (${result.error ?? 'unknown error'}).`
    }
    return result.deleted > 0
      ? `Deleted ${result.deleted} memor${result.deleted === 1 ? 'y' : 'ies'} matching "${match}". Confirm briefly to the user.`
      : `No saved memories matched "${match}". Tell the user nothing matching that was found.`
  }

  return `Unknown tool: ${name}`
}

export async function POST(req: NextRequest) {
  try {
    const body         = await req.json()
    const messages     = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language     = LANGUAGE_LABELS[languageCode] || 'English'
    const currentPage  = String(body?.context?.currentPage || '/')

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let isPrivileged = false
    let userId: string | null = null
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin
      userId = access.userId
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

    const model       = isPrivileged ? 'gpt-4o' : 'gpt-4o-mini'
    const temperature = isPrivileged ? 0.5 : 0.4
    const baseTools   = isPrivileged ? CHIEF_OF_STAFF_TOOLS : CONCIERGE_TOOLS
    const tools       = userId ? [...baseTools, TOOL_REMEMBER_FACT, TOOL_FORGET_FACT] : baseTools

    // ── Pre-fetch live metrics for Chief of Staff on every request ────────
    let liveMetrics = 'Metrics unavailable — Supabase query failed.'
    if (isPrivileged) {
      try {
        const metricsResult = await getBusinessMetrics()
        if (metricsResult.ok && metricsResult.metrics) {
          liveMetrics = formatMetricsForAI(metricsResult.metrics)
        }
      } catch {
        // non-blocking — fallback text already set
      }
    }

    let systemContent = isPrivileged
      ? chiefOfStaffPrompt(language, liveMetrics)
      : conciergePrompt(language)

    // ── Long-term user memory (logged-in users only) ──────────────────────
    if (userId) {
      try {
        const memories = await loadUserMemories(userId)
        const memoryBlock = formatMemoriesForAI(memories)
        systemContent += `

${memoryBlock || 'No saved memories for this user yet.'}

MEMORY RULES: Use saved memories to personalize answers naturally — never recite the list back. When the user states a LASTING preference, a fact about themselves or their business, or a goal, call rememberFact to save it (one concise fact per call). When the user asks you to forget something or corrects a saved fact, call forgetFact. Never save secrets, passwords, or payment details.`
      } catch {
        // memory is non-blocking — continue without it
      }
    }

    const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...sanitized,
    ]

    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), 25000)),
      ])

    let response = await withTimeout(
      openai.chat.completions.create({
        model,
        temperature,
        messages: convo,
        tools,
        tool_choice: 'auto',
      })
    )

    let choice     = response.choices[0]
    let toolRounds = 0

    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && toolRounds < 3) {
      toolRounds++

      convo.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam)

      for (const call of choice.message.tool_calls) {
        const toolName = call.function?.name || ''
        const toolArgs = call.function?.arguments || '{}'
        const result   = await runTool(toolName, toolArgs, userId)
        convo.push({
          role:         'tool',
          tool_call_id: call.id,
          content:      result,
        })
      }

      response = await withTimeout(
        openai.chat.completions.create({
          model,
          temperature,
          messages: convo,
          tools,
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
