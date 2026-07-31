// saas/app/api/cron/prospect-campaign/route.ts
// Advances background prospect campaigns a few companies at a time. Invoked by Vercel
// Cron (see saas/vercel.json). The preferred authentication is CRON_SECRET. When that
// optional variable is not configured, accept only Vercel's documented cron user-agent.
//
// One tick claims the oldest unfinished job, runs discovery if it has no candidate list
// yet, then drafts for up to three companies inside a 45-second internal budget. It
// never sends: every draft lands in outreach_queue as 'pending' for owner approval.

import { NextRequest, NextResponse } from 'next/server'
import { advanceProspectCampaigns } from '@/lib/outreach/prospectCampaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
