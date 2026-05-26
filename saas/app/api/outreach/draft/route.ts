import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type Prospect = {
  id: string
  business_name: string
  category: string | null
  location: string | null
  website: string | null
  phone: string | null
  status: string
  web_presence_score: number | null
  assessment: string | null
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getAuthedUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
  const { data: { user } } = await sb.auth.getUser()
  return user
}

function fallbackDraft(prospect: Prospect) {
  const hasWebsite = Boolean(prospect.website)
  const subject = `Quick idea for ${prospect.business_name}`
  const body = `Hi ${prospect.business_name} team,\n\nI came across ${prospect.business_name}${prospect.location ? ` in ${prospect.location}` : ''} and wanted to share a quick growth idea.\n\nSignalBoost helps local businesses turn their existing reputation into more customers with simple website updates, review campaigns, promotional content, and follow-up emails.\n\n${hasWebsite ? 'Since you already have a website, a good next step could be improving conversion and adding campaigns that bring visitors back.' : 'I noticed there may be an opportunity to improve your online presence with a simple page and review-driven promotion.'}\n\nWould you be open to seeing a quick example campaign for your business?\n\nBest,\nSignalBoost Team`
  return { subject, body }
}

async function generateWithOpenAI(prospect: Prospect) {
  if (!process.env.OPENAI_API_KEY) return fallbackDraft(prospect)

  const prompt = `Create a concise cold outreach email for this local business prospect.\n\nBusiness: ${prospect.business_name}\nCategory: ${prospect.category || 'unknown'}\nLocation: ${prospect.location || 'unknown'}\nWebsite: ${prospect.website || 'none found'}\nPhone: ${prospect.phone || 'none'}\nAssessment: ${prospect.assessment || 'none'}\nOpportunity score: ${prospect.web_presence_score ?? 'unknown'}\n\nWrite as SignalBoost. The goal is to offer a helpful growth idea, not sound spammy. Keep it friendly, specific, and under 150 words. Return strict JSON only:\n{"subject":"...","body":"..."}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.45,
      messages: [
        { role: 'system', content: 'You write practical, ethical B2B outreach for SignalBoost. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) return fallbackDraft(prospect)
  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content || ''

  try {
    const parsed = JSON.parse(raw)
    return {
      subject: String(parsed.subject || '').trim() || fallbackDraft(prospect).subject,
      body: String(parsed.body || '').trim() || fallbackDraft(prospect).body,
    }
  } catch {
    return fallbackDraft(prospect)
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { prospectId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  if (!body.prospectId) {
    return NextResponse.json({ error: 'missing prospectId' }, { status: 400 })
  }

  const a = admin()
  const { data: prospect, error } = await a
    .from('prospects')
    .select('id, business_name, category, location, website, phone, status, web_presence_score, assessment')
    .eq('id', body.prospectId)
    .single()

  if (error || !prospect) {
    return NextResponse.json({ error: error?.message || 'prospect not found' }, { status: 404 })
  }

  const draft = await generateWithOpenAI(prospect as Prospect)
  return NextResponse.json({ draft, prospect })
}
