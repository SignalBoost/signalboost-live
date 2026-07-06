import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'

export const dynamic = 'force-dynamic'

function withChannel(row: any) {
  const website = row?.website_json && typeof row.website_json === 'object' ? row.website_json : {}
  const analyzer = row?.analyzer_summary && typeof row.analyzer_summary === 'object' ? row.analyzer_summary : {}
  const channel = row?.outreach_channel || row?.channel || website.outreach_channel || website.channel || analyzer.outreach_channel || analyzer.channel || ''
  return { ...row, outreach_channel: channel, channel }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = req.nextUrl.searchParams.get('status')
  const channel = req.nextUrl.searchParams.get('channel')
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 50))
  let query = ctx.admin
    .from('outreach_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const normalized = (data || []).map(withChannel)
  const outreach = channel ? normalized.filter((row: any) => row.outreach_channel === channel || row.channel === channel) : normalized
  const sendLimit = await enforceDailySendLimit(ctx.admin)
  return NextResponse.json({ outreach, sendLimit })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const status = body?.status ? String(body.status) : undefined
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (status) patch.status = status
  if (body?.outreach_message !== undefined) {
    const message = String(body.outreach_message).trim()
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) return NextResponse.json({ error: safe.reason }, { status: 400 })
    patch.outreach_message = message
  }
  if (body?.website_json !== undefined) patch.website_json = body.website_json
  if (body?.review_strategy !== undefined) patch.review_strategy = body.review_strategy
  if (body?.social_plan !== undefined) patch.social_plan = body.social_plan
  if (body?.promo_plan !== undefined) patch.promo_plan = body.promo_plan
  if (status === 'approved') {
    patch.approved_by = ctx.user.id
    patch.approved_at = new Date().toISOString()
  }
  if (status === 'rejected') {
    patch.approved_by = null
    patch.approved_at = null
  }

  const { data, error } = await ctx.admin
    .from('outreach_queue')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: status ? `outreach.${status}` : 'outreach.edit',
    targetType: 'outreach_queue',
    targetId: id,
    metadata: { fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true, outreach: withChannel(data) })
}
