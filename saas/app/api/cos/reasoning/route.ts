import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosReasoningBridge } from '@/lib/cos/reasoning-bridge'
import { ingestLiveResearchSignals } from '@/lib/cos/external-signals/live-research'
import type { CosReasoningBridgeInput } from '@/lib/cos/reasoning-bridge'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const userText = req.nextUrl.searchParams.get('q') || 'Create a marketing-grade SignalBoost video decision.'
  const liveSignals = await ingestLiveResearchSignals(userText)
  const reasoning = buildCosReasoningBridge({ user_text: userText, surface: 'cos', external_signals: liveSignals.signals })
  return NextResponse.json({ ok: true, reasoning, live_signals: liveSignals })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: CosReasoningBridgeInput & { live_query?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  let enriched = body || {}
  if (!Array.isArray(enriched.external_signals) || enriched.external_signals.length === 0) {
    const liveSignals = await ingestLiveResearchSignals(enriched.live_query || enriched.user_text || undefined)
    enriched = { ...enriched, external_signals: liveSignals.signals }
  }

  const reasoning = buildCosReasoningBridge(enriched)
  return NextResponse.json({ ok: true, reasoning })
}
