import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildNicheVideoConcept, defaultSignalBoostNicheVideoInput } from '@/lib/cos/niche-video'
import type { NicheVideoStrategyInput } from '@/lib/cos/niche-video'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const input = defaultSignalBoostNicheVideoInput()
  const concept = buildNicheVideoConcept(input)

  return NextResponse.json({ ok: true, input, concept })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<NicheVideoStrategyInput>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const defaults = defaultSignalBoostNicheVideoInput()
  const input: NicheVideoStrategyInput = {
    ...defaults,
    ...body,
    signals: Array.isArray(body.signals) && body.signals.length ? body.signals : defaults.signals,
    languages: Array.isArray(body.languages) && body.languages.length ? body.languages as NicheVideoStrategyInput['languages'] : defaults.languages,
  }

  if (!input.product_or_service || !input.niche || !input.target_audience) {
    return NextResponse.json({ ok: false, error: 'product_or_service, niche, and target_audience are required.' }, { status: 400 })
  }

  const concept = buildNicheVideoConcept(input)
  return NextResponse.json({ ok: true, input, concept })
}
