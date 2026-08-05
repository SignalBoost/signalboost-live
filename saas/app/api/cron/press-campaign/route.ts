// saas/app/api/cron/press-campaign/route.ts
// Advances background press campaigns a few outlets at a time. Invoked by Vercel Cron
// (see saas/vercel.json). The preferred authentication is CRON_SECRET. When that
// optional variable is not configured, accept only Vercel's documented cron user-agent
// — the same fallback the prospect worker uses, and safe for the same reason: this
// worker can PREPARE drafts and can do nothing else.
//
// One tick claims the oldest unfinished job, tops up its outlet queue when that queue
// has run dry, then drafts up to six publications inside a 50-second internal budget.
// It never sends and it never approves: every draft lands in press_campaigns as
// 'pending_owner_review' and waits for the owner at
// /dashboard/marketing/press-providers.

import { NextRequest, NextResponse } from 'next/server'
import { advancePressCampaigns } from '@/lib/outreach/pressCampaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One outlet costs an AI-written release, and the discovery phase is a live crawl.
// 60 seconds cannot hold both, which is the entire reason this worker exists — the
// same mistake one level up would be a poor joke. The internal budget stops well
// short of this ceiling.
export const maxDuration = 300

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''

  // When configured, CRON_SECRET remains the strongest and only accepted credential.
  if (secret) return auth === `Bearer ${secret}`

  // Vercel documents this exact user-agent for platform-triggered cron invocations.
  return (req.headers.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0'
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await advancePressCampaigns()
  if (!result.ok) {
    console.error('cron press-campaign failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    jobId: result.jobId || null,
    status: result.status || null,
    units: result.units,
  })
}
