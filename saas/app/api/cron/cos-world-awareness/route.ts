import { NextRequest, NextResponse } from 'next/server'
import { runWorldAwareness } from '@/lib/ai/cos/worldAwareness'
import { worldAwarenessDue } from '@/lib/ai/cos/worldAwarenessCadence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cadence = await worldAwarenessDue()
  if (!cadence.due) {
    return NextResponse.json({
      ok: true,
      awareness: { status: 'skipped', reason: cadence.reason },
      cadence,
      external_fetch_performed: false,
      model_invoked: false,
    })
  }

  const result = await runWorldAwareness()
  return NextResponse.json({
    ok: result.status !== 'error',
    awareness: result,
    cadence,
    external_fetch_performed: result.status === 'refreshed',
    model_invoked: false,
  }, { status: result.status === 'error' ? 500 : 200 })
}
