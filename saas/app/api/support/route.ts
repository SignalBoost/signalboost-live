import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { classifyVideoIntent, runConciergeVideoPipeline } from '@/lib/video/conciergePipeline'

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

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function getAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
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

    if (classifyVideoIntent(latestUserMessage) !== 'general') {
      const user = await getAuthenticatedUser()
      const admin = getAdminClient()
      if (user?.id && admin) {
        const videoPipeline = await runConciergeVideoPipeline({
          supabase: admin,
          userId: user.id,
          message: latestUserMessage,
          language: languageCode,
          sourceVideo: typeof body?.context?.sourceVideo === 'string' ? body.context.sourceVideo : undefined,
          captionsPath: typeof body?.context?.captionsPath === 'string' ? body.context.captionsPath : undefined,
        })
        if (videoPipeline) {
          return NextResponse.json({
            reply: videoPipeline.reply,
            telemetry: { ...local, conciergePipeline: videoPipeline.json },
            source: 'concierge-video-pipeline',
          })
        }
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: local.reply, telemetry: local, source: 'deterministic-concierge' })
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
          content: `You are SignalBoost Concierge for the unified SignalBoost Marketplace + SaaS platform. Reply strictly in ${language}. Be practical, concise, accessible, and HMI-style with steps. Cover Marketplace partners/categories/bookings and SaaS modules Promote Business, Reviews, Calendar, Spreadsheets, Outreach, Admin telemetry, CRM pipeline, forecasts, financial/KPI dashboards, and owner/admin restrictions when relevant. Always mention telemetry logging for Concierge actions. For video_transcode or video_export intents, route through IntentClassifier, SubscriptionChecker, JobQueueController, StorageController, BillingHandler, and Translator; do not promise full export to free/demo users.`
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

    return NextResponse.json({ reply, telemetry: local, source: 'openai-concierge' })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ error: 'Could not process your request right now.' }, { status: 500 })
  }
}
