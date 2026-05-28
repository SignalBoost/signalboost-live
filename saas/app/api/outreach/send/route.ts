import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

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

  const limit = await enforceDailySendLimit(ctx.admin, 50)
  if (!limit.ok) return NextResponse.json({ error: 'Daily outreach send limit reached', sendLimit: limit }, { status: 429 })

  const { data: outreach, error } = await ctx.admin
    .from('outreach_queue')
    .select('*')
    .eq('id', outreachId)
    .single()

  if (error || !outreach) return NextResponse.json({ error: error?.message || 'Outreach not found' }, { status: 404 })
  if (outreach.status !== 'approved') return NextResponse.json({ error: 'Outreach must be approved before sending.' }, { status: 409 })

  const safe = assertSafeOutreachMessage(String(outreach.outreach_message || ''))
  if (!safe.ok) return NextResponse.json({ error: safe.reason }, { status: 400 })

  let providerResult: Record<string, unknown> = { mode: 'manual_record_only' }
  if (channel === 'email' && toEmail) {
    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: `Useful SignalBoost growth preview for ${outreach.business_name}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${String(outreach.outreach_message).replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</div>`,
    })
    if (!sent.ok) return NextResponse.json({ error: sent.error || 'Email send failed' }, { status: 502 })
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
  if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 })

  await ctx.admin.from('outreach_queue').update({ status: 'sent', sent_at: sentAt }).eq('id', outreachId)
  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.send',
    targetType: 'outreach_queue',
    targetId: outreachId,
    metadata: { channel, providerResult },
  })

  return NextResponse.json({ ok: true, sentAt, sendLimit: { ...limit, count: limit.count + 1 }, providerResult })
}
