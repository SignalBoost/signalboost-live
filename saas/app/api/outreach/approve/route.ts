// saas/app/api/outreach/approve/route.ts
//
// SALES OUTREACH APPROVALS CARRY AN IDENTITY: an ID number, a kind, and a date.
//
// This table (outreach_queue) is the sales pipeline's own store — no other portable writes
// approvable records into it, so unlike cos_campaign_queue there is no cross-pipeline hole to
// guard here. What its approvals lacked was the identity the owner requires on every approval:
// a quotable reference, the owning pipeline's name, and the two dates an audit must be able to
// tell apart — when the record ENTERED the queue and when it was DECIDED.
//
// The reference is minted at decision time if the row does not already carry one, with the
// REQUESTED date taken from the row's created_at — the day it entered the queue, not the day
// somebody got to it. Minted once, never rewritten: a re-approval keeps the original reference,
// because the record's identity does not change when a decision does.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { mintApprovalIdentity } from '@/portable-kernel'

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

  // Read the row first: the identity needs created_at, and an existing reference must survive.
  const { data: existing, error: readError } = await ctx.admin
    .from('outreach_queue')
    .select('id, created_at, approval_ref, approval_kind, approval_requested_at')
    .eq('id', id)
    .single()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

  const patch: Record<string, unknown> = { status: decision }
  if (!existing?.approval_ref) {
    const identity = mintApprovalIdentity('sales_outreach', String(existing?.created_at || new Date().toISOString()))
    patch.approval_ref = identity.ref
    patch.approval_kind = identity.kind
    patch.approval_requested_at = identity.requestedAt
  }
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
    metadata: { editedMessage: message !== undefined, approvalRef: (patch.approval_ref as string) || existing?.approval_ref || null },
  })

  return NextResponse.json({ ok: true, outreach: data })
}
