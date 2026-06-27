// saas/app/api/cron/cos-mining/route.ts
// Scheduled mining job, invoked by Vercel Cron (see saas/vercel.json). Secured with
// CRON_SECRET exactly like the other crons. ?job=daily (default) or ?job=weekly.

import { NextRequest, NextResponse } from 'next/server'
import { runMiningPipeline } from '@/lib/cos/mining/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobParam = new URL(req.url).searchParams.get('job')
  const job = jobParam === 'weekly' ? 'weekly' : 'daily'

  const result = await runMiningPipeline({ job, actor: 'cron' })
  if (!result.ok) {
    console.error('cron cos-mining failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, summary: result.summary })
}
