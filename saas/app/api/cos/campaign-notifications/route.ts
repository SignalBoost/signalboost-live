import { NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

type NotificationAction = 'approve' | 'request_edits' | 'reject' | 'archive'

const ACTIONS: NotificationAction[] = ['approve', 'request_edits', 'reject', 'archive']

function normalizeAction(value: unknown): NotificationAction | null {
  return typeof value === 'string' && ACTIONS.includes(value as NotificationAction) ? value as NotificationAction : null
}

function statusForAction(action: NotificationAction, currentStatus: string) {
  if (action === 'approve') return 'approved'
  if (action === 'reject' || action === 'archive') return 'rejected'
  return currentStatus === 'draft' ? 'waiting_approval' : currentStatus
}

function metadataForAction(action: NotificationAction, currentMetadata: Record<string, any>, actorId: string) {
  const now = new Date().toISOString()
  return {
    ...currentMetadata,
    last_notification_action: action,
    last_notification_actor: actorId,
    last_notification_at: now,
    edit_requested_at: action === 'request_edits' ? now : currentMetadata.edit_requested_at,
    archived_at: action === 'archive' ? now : currentMetadata.archived_at,
    publishing_gate: action === 'approve' ? 'approved_for_next_step' : 'locked_until_owner_approval',
  }
}

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  const action = normalizeAction(body?.action)
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  if (!action) return NextResponse.json({ ok: false, error: 'Valid notification action is required.' }, { status: 400 })

  const { data: campaign, error: loadError } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .eq('id', id)
    .single()

  if (loadError || !campaign) {
    return NextResponse.json({ ok: false, error: loadError?.message || 'Campaign not found' }, { status: 404 })
  }

  const status = statusForAction(action, campaign.status || 'waiting_approval')
  const patch: Record<string, unknown> = {
    status,
    metadata: metadataForAction(action, campaign.metadata || {}, ctx.user.id),
  }

  if (status === 'approved') {
    patch.approved_by = ctx.user.id
    patch.approved_at = new Date().toISOString()
  }

  if (status === 'rejected') {
    patch.approved_by = null
    patch.approved_at = null
  }

  const { data: updated, error: updateError } = await ctx.admin
    .from('cos_campaign_queue')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: `cos_notification.${action}`,
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: {
      previous_status: campaign.status,
      next_status: status,
      channel: campaign.channel,
      recommendation_id: campaign.recommendation_id,
    },
  })

  return NextResponse.json({ ok: true, campaign: updated })
}
