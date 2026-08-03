// saas/app/api/cron/prospect-campaign/route.ts
// Advances background prospect campaigns a few companies at a time. Invoked by Vercel
// Cron (see saas/vercel.json). The preferred authentication is CRON_SECRET. When that
// optional variable is not configured, accept only Vercel's documented cron user-agent.
//
// One tick claims the oldest unfinished job, tops up its candidate queue when that queue
// has run dry, then works through companies in CONCURRENT BATCHES inside a 240-second
// internal budget. Batch width and the per-tick ceiling are set by
// OUTREACH_CAMPAIGN_CONCURRENCY and OUTREACH_CAMPAIGN_UNITS_PER_TICK so a buyer can
// match the worker to their own model and enrichment rate limits. It never sends: every
// draft lands in outreach_queue as 'pending' for owner approval.

import { NextRequest, NextResponse } from 'next/server'
import { advanceProspectCampaigns } from '@/lib/outreach/prospectCampaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 60 seconds was never enough for this work and every tick 504'd on it for two days.
// One company costs a model call plus up to nine page fetches to find a published
// email; three companies plus discovery cannot fit in a minute. Other routes in this
// app already run at 300 (see app/api/concierge), so the platform allows it — the
// internal budget below still stops well short of the ceiling.
export const maxDuration = 300

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''

  // When configured, CRON_SECRET remains the strongest and only accepted credential.
  if (secret) return auth === `Bearer ${secret}`

  // Vercel documents this exact user-agent for platform-triggered cron invocations.
  // This fallback is intentionally limited to this preparation-only worker: it can
  // create pending drafts but cannot approve or send any email.
  return (req.headers.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0'
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await advanceProspectCampaigns()
  if (!result.ok) {
    console.error('cron prospect-campaign failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    jobId: result.jobId || null,
    status: result.status || null,
    units: result.units,
  })
}
