import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosChatIntelligence } from '@/lib/cos/chat-intelligence'
import type { CosChatIntelligenceInput } from '@/lib/cos/chat-intelligence'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const intelligence = buildCosChatIntelligence({ user_text: 'Create a SignalBoost presenter video that promotes the platform.' })
  return NextResponse.json({ ok: true, intelligence })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: CosChatIntelligenceInput
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const intelligence = buildCosChatIntelligence(body || {})
  return NextResponse.json({ ok: true, intelligence })
}
