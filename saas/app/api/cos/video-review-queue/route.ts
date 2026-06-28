import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

const allowed = ['draft','waiting_approval','approved','processing','ready','scheduled','done','rejected','failed']

function safeStatus(value: unknown) {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

function draftFromCampaign(campaign: any) {
  const output = Array.isArray(campaign.work_items)
    ? campaign.work_items.find((item: any) => item?.output)?.output
    : null

  const title = String(output?.title || campaign.title || 'SignalBoost campaign').slice(0, 95)
  const description = String(output?.opening || campaign.objective || 'SignalBoost campaign prepared by COSA.')

  return {
    campaign_id: campaign.id,
    title,
    description,
    tags: ['signalboost', 'business', 'ai', 'marketing'],
    video_asset_url: null,
    video_asset_path: null,
    external_video_id: null,
    status: 'waiting_approval',
    approval_required: true,
    metadata: {
      source: 'cosa_campaign_queue',
      channel: campaign.channel || null,
      campaign_status: campaign.status || null,
      next_step: 'connect external video platform credentials and final asset rendering',
    },
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = safeStatus(req.nextUrl.searchParams.get('status'))
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 50))

  let query = ctx.admin
    .from('cos_video_review_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message, items: [] }, { status: 500 })

  return NextResponse.json({ ok: true, items: data || [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const campaignId = String(body?.campaign_id || '').trim()
  if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error: campaignError } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) return NextResponse.json({ ok: false, error: campaignError?.message || 'Campaign not found' }, { status: 404 })

  const draft = draftFromCampaign(campaign)
  const { data, error } = await ctx.admin
    .from('cos_video_review_queue')
    .insert(draft)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_video_review.create',
    targetType: 'cos_video_review_queue',
    targetId: data.id,
    metadata: { campaign_id: campaignId },
  })

  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  const status = safeStatus(body?.status)
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  if (!status) return NextResponse.json({ ok: false, error: 'Valid status is required' }, { status: 400 })

  const patch: Record<string, unknown> = { status }
  if (status === 'approved') {
    patch.approved_by = ctx.user.id
    patch.approved_at = new Date().toISOString()
  }
  if (status === 'rejected') {
    patch.approved_by = null
    patch.approved_at = null
  }
  if (body?.metadata !== undefined) patch.metadata = body.metadata
  if (body?.video_asset_url !== undefined) patch.video_asset_url = body.video_asset_url
  if (body?.video_asset_path !== undefined) patch.video_asset_path = body.video_asset_path
  if (body?.external_video_id !== undefined) patch.external_video_id = body.external_video_id

  const { data, error } = await ctx.admin
    .from('cos_video_review_queue')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: `cos_video_review.${status}`,
    targetType: 'cos_video_review_queue',
    targetId: id,
    metadata: { fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true, item: data })
}
