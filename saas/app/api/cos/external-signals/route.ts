import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { ingestExternalSignals, starterExternalSignals } from '@/lib/cos/external-signals'
import type { ExternalSignalInput } from '@/lib/cos/external-signals'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const result = ingestExternalSignals(starterExternalSignals())
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: { signals?: ExternalSignalInput[] }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON', signals: [], marketing_signals: [], summary: [] }, { status: 400 }) }

  const result = ingestExternalSignals(Array.isArray(body.signals) ? body.signals : [])
  return NextResponse.json(result)
}
