import { NextRequest, NextResponse } from 'next/server'
import { expireStaleDurableCosTurnsSystemWide } from '@/lib/ai/cos/durableCosTurn.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const expired = await expireStaleDurableCosTurnsSystemWide()
    return NextResponse.json({ ok: true, expired })
  } catch (error) {
    console.error('[cos_stale_turns_cron_failed]', error)
    return NextResponse.json({ ok: false, error: 'cos_stale_cleanup_failed' }, { status: 503 })
  }
}
