// saas/app/api/outreach/campaigns/route.ts
//
// ACTIVE CAMPAIGN CONTEXT for the manual outreach screens.
//
// A campaign already carries everything a person would need to know before writing to a
// prospect by hand: what is being sold, who it is aimed at, which country, which
// language. That context lived only inside the background worker, so the manual
// discovery screen had no idea a campaign was running and pitched the SignalBoost
// platform to every lead regardless of what the owner was actually selling that week.
//
// This exposes the campaigns so the manual screens can inherit the same brief the
// worker is using — the operator picks the campaign instead of retyping the offer, and
// a hand-made draft says the same thing as an automated one.
//
// Read-only. Owner/admin gated like every other outreach route.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { listProspectCampaignJobs } from '@/lib/outreach/prospectCampaign'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const result = await listProspectCampaignJobs(20)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

  // Finished campaigns stay selectable: an operator often works a list by hand after
  // the worker has stopped, and the brief is still the right one to write from.
  const campaigns = result.jobs
    .filter(job => job.status !== 'cancelled')
    .map(job => ({
      id: job.id,
      offer: job.offer,
      target_criteria: job.target_criteria,
      region: job.region,
      language: job.language,
      status: job.status,
      drafts_created: job.drafts_created,
      requested_count: job.requested_count,
      created_at: job.created_at,
    }))

  return NextResponse.json({ campaigns })
}
