// saas/app/api/cron/marketing-sales-director/route.ts
// Daily autonomous director run. Gated by CRON_SECRET exactly like the other crons.
import { NextRequest, NextResponse } from 'next/server'
import { runSignalBoostDirector } from '@/marketing-sales-host/director'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await runSignalBoostDirector()
    if (!r.ok) {
      console.error('cron marketing-sales-director failed:', r.error)
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, summary: r.data })
  } catch (e: any) {
    console.error('cron marketing-sales-director threw:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || 'director failed' }, { status: 500 })
  }
}
