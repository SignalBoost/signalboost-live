import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import {
  buildNicheVideoConcept,
  defaultSignalBoostNicheVideoInput,
  PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS,
  playbookToNicheVideoInput,
} from '@/lib/cos/niche-video'
import { buildCosHeroStrategy } from '@/lib/cos/creative-strategy'
import type { NicheVideoStrategyInput } from '@/lib/cos/niche-video'

export const dynamic = 'force-dynamic'

const FIVE_LANGUAGES: NicheVideoStrategyInput['languages'] = ['en', 'es', 'pt', 'pl', 'ru']

function withFiveLanguages(input: NicheVideoStrategyInput): NicheVideoStrategyInput {
  return { ...input, languages: FIVE_LANGUAGES }
}

function heroInputFromVideoInput(input: NicheVideoStrategyInput) {
  return {
    company_name: input.company_name,
    product_or_service: input.product_or_service,
    niche: input.niche,
    audience: input.target_audience,
    pain: input.primary_pain,
    traffic_goal: 'site_visit' as const,
    languages: FIVE_LANGUAGES,
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const playbookId = req.nextUrl.searchParams.get('playbook')
  const rawInput = playbookId ? playbookToNicheVideoInput(playbookId) : defaultSignalBoostNicheVideoInput()

  if (!rawInput) {
    return NextResponse.json({ ok: false, error: 'Unknown playbook.', playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS }, { status: 404 })
  }

  const input = withFiveLanguages(rawInput)
  const concept = buildNicheVideoConcept(input)
  const hero_strategy = buildCosHeroStrategy(heroInputFromVideoInput(input))

  return NextResponse.json({ ok: true, input, concept, hero_strategy, playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<NicheVideoStrategyInput> & { playbook?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const playbookInput = body.playbook ? playbookToNicheVideoInput(body.playbook) : null
  const defaults = playbookInput || defaultSignalBoostNicheVideoInput()
  const input: NicheVideoStrategyInput = withFiveLanguages({
    ...defaults,
    ...body,
    signals: Array.isArray(body.signals) && body.signals.length ? body.signals : defaults.signals,
    preferred_channels: Array.isArray(body.preferred_channels) && body.preferred_channels.length ? body.preferred_channels : defaults.preferred_channels,
  })

  if (!input.product_or_service || !input.niche || !input.target_audience) {
    return NextResponse.json({ ok: false, error: 'product_or_service, niche, and target_audience are required.' }, { status: 400 })
  }

  const concept = buildNicheVideoConcept(input)
  const hero_strategy = buildCosHeroStrategy(heroInputFromVideoInput(input))
  return NextResponse.json({ ok: true, input, concept, hero_strategy, playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS })
}
