import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import {
  buildNicheVideoConcept,
  defaultSignalBoostNicheVideoInput,
  PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS,
  playbookToNicheVideoInput,
} from '@/lib/cos/niche-video'
import type { NicheVideoStrategyInput } from '@/lib/cos/niche-video'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const playbookId = req.nextUrl.searchParams.get('playbook')
  const input = playbookId ? playbookToNicheVideoInput(playbookId) : defaultSignalBoostNicheVideoInput()

  if (!input) {
    return NextResponse.json({ ok: false, error: 'Unknown playbook.', playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS }, { status: 404 })
  }

  const concept = buildNicheVideoConcept(input)

  return NextResponse.json({ ok: true, input, concept, playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<NicheVideoStrategyInput> & { playbook?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const playbookInput = body.playbook ? playbookToNicheVideoInput(body.playbook) : null
  const defaults = playbookInput || defaultSignalBoostNicheVideoInput()
  const input: NicheVideoStrategyInput = {
    ...defaults,
    ...body,
    signals: Array.isArray(body.signals) && body.signals.length ? body.signals : defaults.signals,
    languages: Array.isArray(body.languages) && body.languages.length ? body.languages as NicheVideoStrategyInput['languages'] : defaults.languages,
    preferred_channels: Array.isArray(body.preferred_channels) && body.preferred_channels.length ? body.preferred_channels : defaults.preferred_channels,
  }

  if (!input.product_or_service || !input.niche || !input.target_audience) {
    return NextResponse.json({ ok: false, error: 'product_or_service, niche, and target_audience are required.' }, { status: 400 })
  }

  const concept = buildNicheVideoConcept(input)
  return NextResponse.json({ ok: true, input, concept, playbooks: PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS })
}
