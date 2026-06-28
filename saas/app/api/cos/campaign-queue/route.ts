import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { buildDefaultMarketingRecommendation } from '@/lib/cos/recommendation/engine'
import type { CosRecommendation } from '@/lib/cos/recommendation/types'
import { queueItemFromRecommendation } from '@/lib/cos/campaign-queue'
import type { CosCampaignQueueStatus } from '@/lib/cos/campaign-queue'

export const dynamic = 'force-dynamic'

const allowedStatuses: CosCampaignQueueStatus[] = [
  'draft',
  'waiting_approval',
  'approved',
  'queued',
  'running',
  'completed',
  'measured',
  'learned',
  'rejected',
]

function normalizeStatus(value: unknown): CosCampaignQueueStatus | null {
  if (typeof value !== 'string') return null
  return allowedStatuses.includes(value as CosCampaignQueueStatus) ? value as CosCampaignQueueStatus : null
}

function dbRowFromQueueItem(item: ReturnType<typeof queueItemFromRecommendation>) {
  return {
    recommendation_id: item.recommendation_id,
    department: item.department,
    title: item.title,
    objective: item.objective,
    channel: item.channel,
    audience: item.audience,
    languages: item.languages,
    assets: item.assets,
    work_items: item.work_items,
    recommendation: item.recommendation,
    status: item.status,
    risk_level: item.risk_level,
    approval_required: item.approval_required,
    metadata: item.metadata || {},
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = normalizeStatus(req.nextUrl.searchParams.get('status'))
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 50))

  let query = ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, campaigns: [] }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaigns: data || [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = null
  try { body = await req.json() } catch { body = {} }

  const recommendation = (body?.recommendation || buildDefaultMarketingRecommendation()) as CosRecommendation
  if (!recommendation?.id || !recommendation?.title || !recommendation?.recommended_channel) {
    return NextResponse.json({ ok: false, error: 'A valid COS recommendation is required.' }, { status: 400 })
  }

  const queueItem = queueItemFromRecommendation(recommendation)
  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .insert(dbRowFromQueueItem(queueItem))
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.create',
    targetType: 'cos_campaign_queue',
    targetId: data.id,
    metadata: { recommendation_id: recommendation.id, channel: recommendation.recommended_channel },
  })

  return NextResponse.json({ ok: true, campaign: data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const status = normalizeStatus(body?.status)
  if (!status) return NextResponse.json({ ok: false, error: 'Valid status is required.' }, { status: 400 })

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
  if (body?.work_items !== undefined) patch.work_items = body.work_items

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: `cos_campaign.${status}`,
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true, campaign: data })
}
