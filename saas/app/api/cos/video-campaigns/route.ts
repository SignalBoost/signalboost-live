import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosChatIntelligence } from '@/lib/cos/chat-intelligence'

export const dynamic = 'force-dynamic'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildCampaignFromPrompt(prompt: string) {
  const intelligence = buildCosChatIntelligence({
    user_text: prompt || 'Create a SignalBoost enterprise product video campaign.',
    product_or_service: 'SignalBoost SaaS platform',
    audience: 'business operators, marketing leaders, and enterprise buyers',
  })

  const decision = intelligence.marketing_decision
  const presenter = intelligence.presenter_video
  const firstScene = presenter.scenes[0]

  return {
    id: id('cosa_video'),
    title: presenter.title || 'SignalBoost enterprise product video',
    aspect: decision.recommended_format === 'niche_short_9x16' ? '9:16' : '16:9',
    duration: `${Math.floor((presenter.duration_seconds || 30) / 60)}:${String((presenter.duration_seconds || 30) % 60).padStart(2, '0')}`,
    niche: decision.audience || 'enterprise business operations',
    format: decision.recommended_format || 'platform_tour_16x9',
    hero: decision.recommended_hero || 'SignalBoost AI presenter',
    quality: Math.max(75, Math.min(96, decision.confidence_score || 82)),
    status: 'needs_approval',
    hook: firstScene?.presenter_line || decision.creative_brief || 'See how SignalBoost turns scattered business work into approved action.',
    funnel: decision.traffic_plan?.[0] || 'Send viewers to the SignalBoost SaaS platform.',
    scenes: presenter.scenes.map(scene => `${scene.caption}: ${scene.presenter_line}`),
    workflow_status: 'need_approval',
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: { prompt?: string }
  try { body = await req.json() } catch { body = {} }

  const campaign = buildCampaignFromPrompt(body.prompt || '')
  return NextResponse.json({ ok: true, campaign })
}
