import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildMarketingDecision, defaultMarketingDecisionInput } from '@/lib/cos/marketing-decision'
import type { MarketingDecisionInput } from '@/lib/cos/marketing-decision'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const input = defaultMarketingDecisionInput()
  const decision = buildMarketingDecision(input)
  return NextResponse.json({ ok: true, input, decision })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<MarketingDecisionInput>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const defaults = defaultMarketingDecisionInput()
  const input: MarketingDecisionInput = {
    ...defaults,
    ...body,
    signals: Array.isArray(body.signals) ? body.signals : defaults.signals,
  }

  const decision = buildMarketingDecision(input)
  return NextResponse.json({ ok: true, input, decision })
}
