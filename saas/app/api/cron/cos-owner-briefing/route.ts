import { NextRequest, NextResponse } from 'next/server'
import { runOwnerExecutiveBriefing } from '@/lib/ai/cos/ownerExecutiveBriefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runOwnerExecutiveBriefing()
    return NextResponse.json(result, { status: result.ok ? 200 : 503 })
  } catch (error) {
    console.error('[cos-owner-briefing] failed', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'owner_briefing_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return GET(req) }
