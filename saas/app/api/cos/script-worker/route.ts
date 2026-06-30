// saas/app/api/cos/script-worker/batch/route.ts
// Submits a multilingual, platform-aware campaign-copy generation BATCH (OpenAI,
// flat 50% Batch discount). One request per REQUESTED language. Results are
// written back later by the batch-poll cron via applyCampaignCopyOutputs.
// Publishing stays owner-gated; this only prepares review-ready drafts.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { submitBatch } from '@/lib/ai/batch/openaiBatch'
import { buildCampaignCopyRequests } from '@/lib/cos/script-worker/batchGenerator'

export const dynamic = 'force-dynamic'

const DRAFTABLE_STATUSES = ['draft', 'waiting_approval', 'approved', 'queued', 'running']

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const campaignId = String(body?.campaign_id || body?.id || '').trim()
  if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error: loadError } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (loadError || !campaign) {
    return NextResponse.json({ ok: false, error: loadError?.message || 'Campaign not found' }, { status: 404 })
  }

  if (!DRAFTABLE_STATUSES.includes(campaign.status)) {
    return NextResponse.json({ ok: false, error: 'Campaign is not in a draftable state.' }, { status: 400 })
  }

  const requests = buildCampaignCopyRequests(campaign)
  if (!requests.length) {
    return NextResponse.json({ ok: false, error: 'Campaign has no requested languages to generate.' }, { status: 400 })
  }

  const submitted = await submitBatch('campaign_copy', requests, { campaign_id: campaign.id })
  if (!submitted.ok) {
    return NextResponse.json({ ok: false, error: submitted.error || 'Failed to submit batch.' }, { status: 500 })
  }

  const timestamp = new Date().toISOString()
  const languages = requests.map((r) => r.custom_id.split('::')[1])

  const metadata = {
    ...(campaign.metadata || {}),
    last_worker: 'campaign_copy_batch',
    batch_job_id: submitted.jobId,
    batch_submitted_at: timestamp,
    languages_pending: languages,
    publishing_gate: 'locked_until_owner_approval',
  }

  await ctx.admin.from('cos_campaign_queue').update({ metadata }).eq('id', campaign.id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_script_worker.batch_copy_submitted',
    targetType: 'cos_campaign_queue',
    targetId: campaign.id,
    metadata: { channel: campaign.channel, languages, batch_job_id: submitted.jobId },
  })

  return NextResponse.json({ ok: true, batchJob: submitted.jobId, languages })
}
