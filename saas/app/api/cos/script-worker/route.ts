import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { generateContentDraft } from '@/lib/cos/script-worker'
import type { CosContentWorkerInput } from '@/lib/cos/script-worker'

export const dynamic = 'force-dynamic'

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

  if (!['approved', 'queued', 'running'].includes(campaign.status)) {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved or queued before generating worker output.' }, { status: 400 })
  }

  const workItems = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const firstWorkItem = workItems[0]
  const input: CosContentWorkerInput = {
    campaign_id: campaign.id,
    recommendation_id: campaign.recommendation_id,
    title: campaign.title,
    objective: campaign.objective,
    channel: campaign.channel,
    audience: campaign.audience,
    language: firstWorkItem?.input?.language || 'en',
    brief: firstWorkItem?.input?.brief || 'Create a 4-6 minute educational YouTube draft for this campaign.',
  }

  const output = generateContentDraft(input)
  const timestamp = new Date().toISOString()
  const nextWorkItems = workItems.length
    ? workItems.map((item: any, index: number) => index === 0 ? { ...item, status: 'completed', output, updated_at: timestamp } : item)
    : [{ id: `work_content_${Date.now()}`, kind: 'script_worker', status: 'completed', input, output, created_at: timestamp, updated_at: timestamp }]

  const metadata = {
    ...(campaign.metadata || {}),
    last_worker: 'script_worker',
    last_worker_completed_at: timestamp,
    visible_output: 'youtube_content_draft',
  }

  const { data: updated, error: updateError } = await ctx.admin
    .from('cos_campaign_queue')
    .update({
      status: campaign.status === 'approved' ? 'queued' : campaign.status,
      work_items: nextWorkItems,
      metadata,
    })
    .eq('id', campaign.id)
    .select('*')
    .single()

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_script_worker.completed',
    targetType: 'cos_campaign_queue',
    targetId: campaign.id,
    metadata: { recommendation_id: campaign.recommendation_id, channel: campaign.channel },
  })

  return NextResponse.json({ ok: true, campaign: updated, output })
}
