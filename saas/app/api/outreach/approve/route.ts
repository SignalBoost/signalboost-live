import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.outreach_id || body?.id || '').trim()
  const decision = String(body?.decision || body?.status || 'approved').trim().toLowerCase()
  const message = body?.outreach_message !== undefined ? String(body.outreach_message).trim() : undefined

  if (!id) return NextResponse.json({ error: 'outreach_id is required' }, { status: 400 })
  if (!['approved', 'rejected'].includes(decision)) return NextResponse.json({ error: 'decision must be approved or rejected' }, { status: 400 })

  const patch: Record<string, unknown> = { status: decision }
  if (message !== undefined) {
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) return NextResponse.json({ error: safe.reason }, { status: 400 })
    patch.outreach_message = message
  }

  if (decision === 'approved') {
    patch.approved_by = ctx.user.id
    patch.approved_at = new Date().toISOString()
  } else {
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
    action: `outreach.${decision}`,
    targetType: 'outreach_queue',
    targetId: id,
    metadata: { editedMessage: message !== undefined },
  })

  return NextResponse.json({ ok: true, outreach: data })
}
