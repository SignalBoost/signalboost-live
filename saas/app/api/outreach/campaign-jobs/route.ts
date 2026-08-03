// saas/app/api/outreach/campaign-jobs/route.ts
//
// WHY THIS EXISTS: a campaign job could fail and say so to nobody.
//
// `advanceProspectCampaigns` records everything an operator needs — status, how many companies
// it processed, how many drafts it created, how many it skipped, and `last_error` naming what
// went wrong. Nothing read any of it. The job table had readers (`listProspectCampaignJobs`,
// `getProspectCampaignJob`) and NO CALLERS, so a job that failed at discovery looked exactly
// like a job that was still working: the console stayed empty and there was nowhere to look.
//
// That was the reported symptom — "the emails never displayed for approval" — and the missing
// piece was not the worker. It was the absence of anywhere to see what the worker did.
//
// READ-ONLY except for cancel. It starts nothing, sends nothing, and approves nothing.
//
// Owner-only: the records carry the campaign brief and the candidate list.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import {
  cancelProspectCampaignJob,
  getProspectCampaignJob,
  listProspectCampaignJobs,
  summarizeProspectCampaign,
} from '@/lib/outreach/prospectCampaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A job stuck in `queued` for longer than this has almost certainly not been picked up at all,
 * which is a different problem from a job that is working slowly. The cron runs every two
 * minutes; ten is generous enough that a slow tick is never called stalled.
 */
const STALL_MINUTES = 10

function minutesSince(value: string): number {
  const at = Date.parse(String(value || ''))
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.round((Date.now() - at) / 60_000))
}

/**
 * Say what is happening in words an operator can act on.
 *
 * A status alone does not distinguish "discovery failed" from "not started yet", and those need
 * different actions from different people.
 */
function diagnose(job: { status: string; processed: number; drafts_created: number; requested_count: number; last_error: string | null; created_at: string; updated_at: string }): {
  headline: string
  meaning: string
  stalled: boolean
} {
  const idleMinutes = minutesSince(job.updated_at)

  if (job.status === 'failed') {
    return {
      headline: 'Failed',
      meaning: job.last_error
        ? `The worker stopped and recorded: ${job.last_error}`
        : 'The worker stopped without recording a reason, which is itself worth reporting.',
      stalled: false,
    }
  }
  if (job.status === 'cancelled') {
    return { headline: 'Cancelled', meaning: 'This campaign was cancelled. Nothing further will be drafted.', stalled: false }
  }
  if (job.status === 'completed') {
    return {
      headline: 'Completed',
      meaning: job.drafts_created
        ? `${job.drafts_created} draft(s) are waiting in the outreach console for approval.`
        : 'The worker finished without creating any draft. Every candidate was skipped — the results list below names why for each one.',
      stalled: false,
    }
  }
  if (job.status === 'queued' && idleMinutes >= STALL_MINUTES) {
    return {
      headline: 'Not started',
      meaning: `Queued ${idleMinutes} minutes ago and never picked up. The worker runs every two minutes, so this points at the scheduler rather than the campaign: check that the prospect-campaign cron is running and authorised.`,
      stalled: true,
    }
  }
  if (idleMinutes >= STALL_MINUTES) {
    return {
      headline: 'Stalled',
      meaning: `Last progress ${idleMinutes} minutes ago. It should advance every two minutes.${job.last_error ? ` Last recorded note: ${job.last_error}` : ''}`,
      stalled: true,
    }
  }
  return {
    headline: job.status === 'queued' ? 'Waiting to start' : 'Working',
    meaning: `${job.processed} of ${job.requested_count} companies processed, ${job.drafts_created} draft(s) created so far.${job.last_error ? ` Last note: ${job.last_error}` : ''}`,
    stalled: false,
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — campaign jobs are owner-only' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const single = await getProspectCampaignJob(id)
    if (!single.ok || !single.job) return NextResponse.json({ error: single.error || 'Campaign job not found.' }, { status: 404 })
    return NextResponse.json({
      jobs: [{ ...single.job, diagnosis: diagnose(single.job), summary: summarizeProspectCampaign(single.job) }],
    })
  }

  const listed = await listProspectCampaignJobs(10)
  if (!listed.ok) return NextResponse.json({ error: listed.error || 'Could not read campaign jobs.' }, { status: 500 })

  return NextResponse.json({
    jobs: listed.jobs.map(job => ({ ...job, diagnosis: diagnose(job), summary: summarizeProspectCampaign(job) })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — campaign jobs are owner-only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string }
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Only the cancel action is supported here.' }, { status: 400 })
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const cancelled = await cancelProspectCampaignJob(body.id)
  if (!cancelled.ok) return NextResponse.json({ error: cancelled.error || 'Could not cancel this campaign.' }, { status: 409 })
  return NextResponse.json({ ok: true, cancelled: body.id })
}
