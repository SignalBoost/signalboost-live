import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { runPodcastConciergePipeline } from '@/lib/podcast/conciergePipeline'

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

    if (!sanitized.length) {
      const local = getConciergeAnswer('', languageCode, currentPage)
      return NextResponse.json({ reply: local.reply, telemetry: local })
    }

    const latestUserMessage = [...sanitized].reverse().find(m => m.role === 'user')?.content || ''
    const local = getConciergeAnswer(latestUserMessage, languageCode, currentPage)
    const podcastPipeline = runPodcastConciergePipeline(latestUserMessage, languageCode)
    const isPodcastIntent = podcastPipeline.intent !== 'general'

    if (!process.env.OPENAI_API_KEY) {
      const podcastReply = isPodcastIntent
        ? `${podcastPipeline.replyPrefix} Open /saas-station/podcasts, paste the feed URL, then choose Analyzer, Optimizer, or Rebuild. Telemetry will record the Concierge action.`
        : local.reply
      return NextResponse.json({ reply: podcastReply, telemetry: { ...local, podcastPipeline }, source: isPodcastIntent ? 'deterministic-podcast-concierge' : 'deterministic-concierge' })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: `You are SignalBoost Concierge for the unified SignalBoost Marketplace + SaaS platform. Reply strictly in ${language}. Be practical, concise, accessible, and HMI-style with steps. Cover Marketplace partners/categories/bookings and SaaS modules Promote Business, Reviews, Calendar, Spreadsheets, Outreach, Admin telemetry, CRM pipeline, forecasts, financial/KPI dashboards, podcast analyzer, podcast optimizer, podcast rebuild engine, and owner/admin restrictions when relevant. Always mention telemetry logging for Concierge actions. Podcast ConciergePipeline context: ${JSON.stringify(podcastPipeline)}. If podcastPipeline.intent is not general, answer with JSON-safe guidance that matches the schema and cite the /saas-station/podcasts workflow.`
        },
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

    return NextResponse.json({ reply, telemetry: { ...local, podcastPipeline }, source: isPodcastIntent ? 'openai-podcast-concierge' : 'openai-concierge' })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ error: 'Could not process your request right now.' }, { status: 500 })
  }
}
