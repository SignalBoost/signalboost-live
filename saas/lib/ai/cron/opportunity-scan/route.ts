// saas/app/api/cron/opportunity-scan/route.ts
// Daily continuous-scanner trigger, called automatically by Vercel Cron
// (see saas/vercel.json). Secured with CRON_SECRET: Vercel sends
// "Authorization: Bearer <CRON_SECRET>" with every cron invocation.

import { NextRequest, NextResponse } from 'next/server'
import { runOpportunityScan } from '@/lib/ai/opportunityScanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runOpportunityScan()
  if (!result.ok) {
    console.error('cron opportunity-scan failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: result.inserted })
}
