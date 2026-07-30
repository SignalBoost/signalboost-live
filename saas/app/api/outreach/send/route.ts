// saas/app/api/outreach/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { sendEmail } from '@/lib/email'
import { markOutreachSent } from '@/lib/outreach/markSent'

export const dynamic = 'force-dynamic'

// A COSA-drafted campaign carries its own subject line (written with the body in
// the campaign language). Use it when present; otherwise keep the generic one so
// manually generated outreach behaves exactly as before.
function draftedSubject(outreach: any): string {
  const summary = outreach?.analyzer_summary
  const subject = summary && typeof summary === 'object' ? summary.outreach_subject : ''
  return typeof subject === 'string' ? subject.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const outreachId = String(body?.outreach_id || body?.id || '').trim()
  const channel = String(body?.channel || 'manual').trim().toLowerCase()
  const toEmail = body?.to_email ? String(body.to_email).trim().toLowerCase() : ''
  if (!outreachId) return NextResponse.json({ error: 'outreach_id is required' }, { status: 400 })

  if (await isOutreachSendingDisabled(ctx.admin)) {
    return NextResponse.json({ error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })
  }

  const { data: outreach, error } = await ctx.admin
    .from('outreach_queue')
    .select('*')
    .eq('id', outreachId)
    .single()

  if (error || !outreach) return NextResponse.json({ error: error?.message || 'Outreach not found' }, { status: 404 })

  // A real send may already exist even when schema drift left outreach_queue.status
  // stuck at approved. Reconcile instead of sending the same email twice.
  const { data: priorSend } = await ctx.admin
    .from('outreach_sends')
    .select('id,sent_at,metadata')
    .eq('outreach_id', outreachId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (priorSend) {
    const queueReconcile = await markOutreachSent(ctx.admin, outreachId, priorSend.sent_at || new Date().toISOString())
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      sentAt: priorSend.sent_at,
      providerResult: priorSend.metadata?.providerResult || { mode: 'resend', id: priorSend.metadata?.resendId },
      queueReconcile,
    })
  }

  if (outreach.status !== 'approved') return NextResponse.json({ error: 'Outreach must be approved before sending.' }, { status: 409 })

  const safe = assertSafeOutreachMessage(String(outreach.outreach_message || ''))
  if (!safe.ok) return NextResponse.json({ error: safe.reason }, { status: 400 })

  const limit = await enforceDailySendLimit(ctx.admin, 50)
  if (!limit.ok) return NextResponse.json({ error: 'Daily outreach send limit reached', sendLimit: limit }, { status: 429 })

  let providerResult: Record<string, unknown> = { mode: 'manual_record_only' }
  if (channel === 'email' && toEmail) {
    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: draftedSubject(outreach) || `Useful SignalBoost growth preview for ${outreach.business_name}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${String(outreach.outreach_message).replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</div>`,
    })
    if (!sent.ok) return NextResponse.json({ error: sent.error || 'Email send failed', providerResult: sent }, { status: 502 })
    providerResult = sent
  }

  const sentAt = new Date().toISOString()
  const { error: sendError } = await ctx.admin.from('outreach_sends').insert({
    outreach_id: outreachId,
    business_id: outreach.business_id,
    channel,
    sent_at: sentAt,
    metadata: { providerResult, toEmail: toEmail || null },
  })
  if (sendError) return NextResponse.json({ error: sendError.message, providerResult }, { status: 500 })

  const queueReconcile = await markOutreachSent(ctx.admin, outreachId, sentAt)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.send',
    targetType: 'outreach_queue',
    targetId: outreachId,
    metadata: { channel, providerResult, queueReconcile },
  })

  // A provider-accepted email is still a real send even if queue status reconciliation
  // needed the schema-drift fallback. Return the reconciliation detail instead of
  // silently pretending the status update succeeded.
  return NextResponse.json({
    ok: true,
    sentAt,
    sendLimit: { ...limit, count: limit.count + 1 },
    providerResult,
    queueReconcile,
  })
}
