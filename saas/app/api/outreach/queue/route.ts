// saas/app/api/outreach/queue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { applyOutreachSignature } from '@/lib/outreach/signature'
import { getRecipientHistory, duplicateReason } from '@/lib/outreach/recipientHistory'
import { sendEmail } from '@/lib/email'
import { markOutreachSent } from '@/lib/outreach/markSent'

export const dynamic = 'force-dynamic'

function withChannel(row: any) {
  const website = row?.website_json && typeof row.website_json === 'object' ? row.website_json : {}
  const analyzer = row?.analyzer_summary && typeof row.analyzer_summary === 'object' ? row.analyzer_summary : {}
  const channel = row?.outreach_channel || row?.channel || website.outreach_channel || website.channel || analyzer.outreach_channel || analyzer.channel || ''
  return { ...row, outreach_channel: channel, channel }
}

function cleanEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  const local = email.split('@')[0]
  if (['test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'privacy', 'legal', 'abuse', 'security'].includes(local)) return null
  return email
}

function escapeHtml(value: string) {
  return String(value || '').replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))
}

function draftedSubject(outreach: any): string {
  const summary = outreach?.analyzer_summary
  const subject = summary && typeof summary === 'object' ? summary.outreach_subject : ''
  return typeof subject === 'string' ? subject.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = req.nextUrl.searchParams.get('status')
  const channel = req.nextUrl.searchParams.get('channel')

  // LIVE DATA: do not let a client-side display preference redefine the size of the
  // database. The Contacts page historically requested ?limit=100 and this route then
  // enforced Math.min(100, ...), so "ALL" could never show more than 100 even when the
  // table contained more rows. Read the queue in database pages instead. The batching is
  // only transport protection; there is no product-visible record ceiling here.
  const PAGE_SIZE = 1000
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = ctx.admin
      .from('outreach_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  // The stored draft is NOT what gets emailed: the team signature and the platform
  // link are applied at send time so that rows approved before those rules existed are
  // covered too. That left the console showing something different from the outbound
  // message, with no way to check the footer before approving. Each row now carries
  // `outbound_message` — the exact text the send route will build — computed with the
  // same function, so the preview and the email cannot drift apart.
  const normalized = rows.map((row: any) => ({
    ...withChannel(row),
    outbound_message: applyOutreachSignature(String(row.outreach_message || ''), row.sender_key || 'saasSales'),
  }))
  const outreach = channel ? normalized.filter((row: any) => row.outreach_channel === channel || row.channel === channel) : normalized
  const sendLimit = await enforceDailySendLimit(ctx.admin)
  return NextResponse.json({ outreach, total: outreach.length, sendLimit })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const status = body?.status ? String(body.status) : undefined
  // 'archived' hides a row from the console without destroying it — the send history
  // in outreach_sends stays intact, and an archived row is still counted by the
  // address-level duplicate guard so it can never be contacted again by accident.
  if (status && !['pending', 'approved', 'rejected', 'archived'].includes(status)) {
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
  if (status === 'rejected' || status === 'archived') {
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
    metadata: { fields: Object.keys(patch), releaseRequested: status === 'approved' && body?.release !== false },
  })

  // Original owner workflow: the human Approve click is the release gate. AI can
  // prepare a PENDING draft, but the email is not sent until this explicit approval.
  // Callers can still pass release:false when they intentionally need approval-only.
  if (status === 'approved' && body?.release !== false) {
    const { data: priorSend } = await ctx.admin
      .from('outreach_sends')
      .select('id,sent_at,metadata')
      .eq('outreach_id', id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (priorSend) {
      const queueReconcile = await markOutreachSent(ctx.admin, id, priorSend.sent_at || new Date().toISOString())
      return NextResponse.json({
        ok: true,
        outreach: withChannel({ ...data, status: 'sent' }),
        release: { ok: true, alreadySent: true, sentAt: priorSend.sent_at, providerResult: priorSend.metadata?.providerResult || null, queueReconcile },
      })
    }

    const toEmail = cleanEmail(data.contact_email)
    if (!toEmail) {
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, reason: 'missing_or_low_quality_contact_email', error: 'Approved, but no valid published recipient email is available. Nothing was sent.' },
      })
    }

    // ADDRESS-LEVEL duplicate guard. This route has its OWN send path — the console's
    // Approve & Send button never touches /api/outreach/send — so the guard has to be
    // repeated here or the main human path would be the one place without it.
    // force:true is the deliberate follow-up, offered in the console only after the
    // refusal has been shown.
    if (body?.force !== true) {
      const history = await getRecipientHistory(ctx.admin, toEmail, id, data.product_key)
      if (history.contacted) {
        return NextResponse.json({
          ok: true,
          outreach: withChannel(data),
          release: {
            ok: false,
            reason: 'duplicate_recipient',
            duplicateRecipient: true,
            error: duplicateReason(history, toEmail),
            lastSentAt: history.lastSentAt,
            previousBusiness: history.businessName,
          },
        })
      }
    }

    if (await isOutreachSendingDisabled(ctx.admin)) {
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, reason: 'panic_switch', error: 'Approved, but outreach sending is disabled by the panic switch. Nothing was sent.' },
      })
    }

    const limit = await enforceDailySendLimit(ctx.admin)
    if (!limit.ok) {
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, reason: 'daily_limit', error: 'Approved, but the daily outreach send limit has been reached. Nothing was sent.', sendLimit: limit },
      })
    }

    const safe = assertSafeOutreachMessage(String(data.outreach_message || ''))
    if (!safe.ok) {
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, reason: 'guardrail', error: safe.reason },
      })
    }

    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: draftedSubject(data) || `Useful SignalBoost growth preview for ${data.business_name}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(String(data.outreach_message || ''))}</div>`,
    })

    if (!sent.ok) {
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, reason: 'provider_error', error: sent.error || 'Email send failed', providerResult: sent },
      })
    }

    const sentAt = new Date().toISOString()
    const { error: sendLogError } = await ctx.admin.from('outreach_sends').insert({
      outreach_id: id,
      business_id: data.business_id,
      channel: 'email',
      sent_at: sentAt,
      metadata: { providerResult: sent, toEmail },
    })

    if (sendLogError) {
      await auditAdminAction({
        admin: ctx.admin,
        actorId: ctx.user.id,
        action: 'outreach.provider_sent_log_failed',
        targetType: 'outreach_queue',
        targetId: id,
        metadata: { providerResult: sent, toEmail, error: sendLogError.message },
      })
      return NextResponse.json({
        ok: true,
        outreach: withChannel(data),
        release: { ok: false, providerAccepted: true, reason: 'send_log_failed', error: sendLogError.message, providerResult: sent },
      })
    }

    const queueReconcile = await markOutreachSent(ctx.admin, id, sentAt)
    await auditAdminAction({
      admin: ctx.admin,
      actorId: ctx.user.id,
      action: 'outreach.approved_and_sent',
      targetType: 'outreach_queue',
      targetId: id,
      metadata: { providerResult: sent, toEmail, queueReconcile },
    })

    return NextResponse.json({
      ok: true,
      outreach: withChannel({ ...data, status: 'sent' }),
      release: { ok: true, sentAt, providerResult: sent, queueReconcile },
    })
  }

  return NextResponse.json({ ok: true, outreach: withChannel(data), release: null })
}

// Permanent removal. Archiving is the safe default and what the console offers first;
// this exists for rows that should never have been created at all — a prompt captured
// as an email body, a directory page, a test row. It refuses to delete anything that
// was actually sent: outreach_sends is the audit trail of what left the building, and
// a queue row that was emailed must remain explainable.
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const id = String(req.nextUrl.searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: row } = await ctx.admin
    .from('outreach_queue')
    .select('id,status,business_name')
    .eq('id', id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Outreach not found' }, { status: 404 })

  const { data: sent } = await ctx.admin
    .from('outreach_sends')
    .select('id')
    .eq('outreach_id', id)
    .limit(1)

  if ((sent || []).length || row.status === 'sent') {
    return NextResponse.json({
      error: 'This message was already sent, so its record cannot be deleted. Archive it instead.',
      sent: true,
    }, { status: 409 })
  }

  const { error } = await ctx.admin.from('outreach_queue').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.delete',
    targetType: 'outreach_queue',
    targetId: id,
    metadata: { business: row.business_name, previousStatus: row.status },
  })
  return NextResponse.json({ ok: true, deleted: id })
}
