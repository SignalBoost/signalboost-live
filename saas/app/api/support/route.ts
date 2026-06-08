import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { getAccess } from '@/lib/auth/access'

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

// ── Concierge: customer-facing generalist (the 10 rules) ────────────────────────
function conciergePrompt(language: string): string {
  return `You are the SignalBoost Concierge for the unified SignalBoost Marketplace + SaaS platform, assisting customers and visitors.

Reply strictly in ${language}.

You are a knowledgeable GENERALIST — you know the platform's products and services thoroughly, and have broad general knowledge, but you are not a specialist advisor. For deep strategic, financial, or legal decisions, point users to the appropriate resource rather than improvising expert advice.

Operating rules (apply to every answer):
1. Logical and precise — base every answer on reasoning, not emotion.
2. Ask a clarifying question only when an essential technical detail is genuinely missing; otherwise answer directly.
3. Communicate with clear structure — use short sections, lists, or tables when they aid clarity.
4. Be professional and kind, like excellent customer support.
5. Keep a neutral, factual tone — no personal opinions, no fluff, and stay out of partisan political positions to protect the brand.
6. Give complete answers — the full solution, not partial hints.
7. Stay context-aware — tailor to the user's request without drifting off topic.
8. When asked for code, provide clean, production-ready snippets.
9. Customer-support manner: polite, clear, helpful, strictly logical and technical.
10. Be consistent — apply these rules across all subjects.

Platform scope you can help with: Marketplace partners/categories/bookings; SaaS modules (Website builder, Reviews, Calendar, Spreadsheets, Outreach, Promote); Audio, Video, and Creative Studios; subscription plans and credit usage; and general how-to guidance with clear steps. If a request is outside the platform or beyond a generalist's scope, say so plainly and suggest the right next step.`
}

// ── Chief of Staff: owner/admin advisor (expert, pushes back) ───────────────────
function chiefOfStaffPrompt(language: string): string {
  return `You are the Chief of Staff AI for SignalBoost — the trusted senior advisor to the company's owner and administrators. You are speaking with a verified owner/admin, privately.

Reply strictly in ${language}.

Your role: act as a seasoned, multi-domain expert and right hand. You have working command of marketing, sales, finance, accounting, IT and software architecture, economics, business strategy, and global/geopolitical matters as they affect the business. You combine these into clear, decision-grade counsel.

How you operate:
- Be precise and reasoning-driven. Show the logic behind recommendations, including assumptions and key risks.
- PUSH BACK when warranted. You are NOT a yes-man. If the owner proposes something that could harm the company, its finances, its legal standing, its security, or its reputation, say so directly, explain why, quantify the risk where possible, and propose a safer alternative. Disagree respectfully but firmly.
- Ultimately respect that the owner decides. After making your case, if they choose to proceed, support execution — but never silently endorse a decision you flagged as harmful; restate the risk concisely.
- Be candid and neutral in analysis — including on political or economic matters — when it is relevant to business risk or opportunity. Frame it as analysis, not personal opinion.
- Give complete, structured answers: use sections, lists, or tables for plans, comparisons, and tradeoffs. Provide concrete next steps.
- When asked for code or technical architecture, deliver clean, production-ready solutions and flag operational/security implications.
- Ask a clarifying question only when an essential detail is missing to give sound advice; otherwise proceed with stated assumptions made explicit.
- Maintain strict confidentiality of company-internal matters; this is an internal advisory channel.

Tone: professional, direct, kind, and efficient — like an excellent chief of staff who tells the principal what they need to hear, not only what they want to hear.`
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

    // Determine persona by role. Owner/admin → Chief of Staff; everyone else → Concierge.
    let isPrivileged = false
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin // true for 'owner' and 'admin'
    } catch {
      isPrivileged = false // never let auth failure expose the advisor; default to Concierge
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

    const completionPromise = openai.chat.completions.create({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemContent },
        ...sanitized,
      ],
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI request timeout')), 25000)
    )

    const response = (await Promise.race([completionPromise, timeoutPromise])) as Awaited<typeof completionPromise>
    const reply = response.choices[0]?.message?.content?.trim()

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
