// saas/app/api/cron/marketing-sales-video/route.ts
// Advances autonomous video production. Gated by CRON_SECRET exactly like the
// other crons. Submits renders for approved video-theme drafts and polls
// in-flight renders to completion, filling asset_url for the YouTube connector.
import { NextRequest, NextResponse } from 'next/server'
import { runSignalBoostVideoCron } from '@/marketing-sales-host/video'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await runSignalBoostVideoCron()
    if (!r.ok) {
      console.error('cron marketing-sales-video failed:', r.error)
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, summary: r.data })
  } catch (e: any) {
    console.error('cron marketing-sales-video threw:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || 'video cron failed' }, { status: 500 })
  }
}
