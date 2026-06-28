import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosReasoningBridge } from '@/lib/cos/reasoning-bridge'
import type { CosReasoningBridgeInput } from '@/lib/cos/reasoning-bridge'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const reasoning = buildCosReasoningBridge({ user_text: 'Create a marketing-grade SignalBoost video decision.', surface: 'cos' })
  return NextResponse.json({ ok: true, reasoning })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: CosReasoningBridgeInput
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const reasoning = buildCosReasoningBridge(body || {})
  return NextResponse.json({ ok: true, reasoning })
}
