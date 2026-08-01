// saas/app/api/admin/outreach/send-ready/route.ts
// Owner/admin-gated batch sender for approved outreach drafts that already have
// a real contact_email. Dry-run by default; append ?send=1 for real sends.
//
// Safety guarantees:
// - never selects rows that already have an outreach_sends record
// - checks again per row before sending to reduce duplicate/race risk
// - records the Resend provider id in outreach_sends
// - marks the outreach_queue row as sent with a schema-tolerant fallback

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { applyOutreachSignature } from '@/lib/outreach/signature'
import { getRecipientHistory, duplicateReason, normalizeAddress } from '@/lib/outreach/recipientHistory'
import { sendEmail } from '@/lib/email'
import { markOutreachSent } from '@/lib/outreach/markSent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function escapeHtml(value: string) {
  return String(value || '').replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))
}

function cleanEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  const local = email.split('@')[0]
  if (['test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'privacy', 'legal', 'abuse', 'security'].includes(local)) return null
  return email
}

async function alreadySent(admin: any, outreachId: string): Promise<boolean> {
  const { count } = await admin
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('outreach_id', outreachId)
  return (count || 0) > 0
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const send = url.searchParams.get('send') === '1'
  // Per-call batch ceiling. Raised from 10 now that the rolling daily cap is off by
  // default; a single call is still bounded so one mistyped URL cannot drain the queue.
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10), 1), 50)

  // TARGETING. Without these the query returned approved rows in unspecified order,
  // which in practice meant the OLDEST rows in the table — drafts from long-finished
  // campaigns aimed at entirely different businesses. A batch send is irreversible, so
  // "whatever the database returned first" is the wrong selection rule.
  const ids = String(url.searchParams.get('ids') || '')
    .split(',').map(value => value.trim()).filter(Boolean).slice(0, 50)
  const sinceHours = Math.max(0, Math.min(parseInt(url.searchParams.get('sinceHours') || '0', 10) || 0, 24 * 90))
  const source = String(url.searchParams.get('source') || '').trim().slice(0, 60)
  const oldestFirst = url.searchParams.get('oldestFirst') === '1'

  if (await isOutreachSendingDisabled(ctx.admin)) {
    return NextResponse.json({ ok: false, error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })
  }

  const daily = await enforceDailySendLimit(ctx.admin)
  if (!daily.ok) return NextResponse.json({ ok: false, error: 'Daily outreach send limit reached', sendLimit: daily }, { status: 429 })
  // With no cap configured there is nothing to subtract from — the batch is bounded by
  // the caller's own limit alone.
  const availableToday = daily.unlimited ? limit : Math.max(0, daily.limit - daily.count)
  const batchLimit = daily.unlimited ? limit : Math.min(limit, availableToday)

  // Fetch more than needed, because some approved rows may have already been sent
  // but still have stale status='approved'. We filter those out below.
  let query = ctx.admin
    .from('outreach_queue')
    .select('id,business_id,business_name,business_url,contact_email,outreach_message,status,sender_key,source_platform,created_at')
    .eq('status', 'approved')
    .not('contact_email', 'is', null)

  if (ids.length) query = query.in('id', ids)
  if (sinceHours) query = query.gte('created_at', new Date(Date.now() - sinceHours * 3_600_000).toISOString())
  if (source) query = query.eq('source_platform', source)

  const { data: candidates, error } = await query
    .order('created_at', { ascending: oldestFirst })
    .limit(Math.min(50, Math.max(batchLimit * 5, batchLimit)))

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidateIds = (candidates || []).map((row: any) => row.id).filter(Boolean)
  let previouslySent = new Set<string>()
  if (candidateIds.length) {
    const { data: sends } = await ctx.admin
      .from('outreach_sends')
      .select('outreach_id')
      .in('outreach_id', candidateIds)
    previouslySent = new Set((sends || []).map((row: any) => row.outreach_id).filter(Boolean))
  }

  const rows = (candidates || [])
    .filter((row: any) => !previouslySent.has(row.id))
    .slice(0, batchLimit)

  const results: any[] = []
  let sentCount = 0
  let skippedCount = 0
  let duplicateSkipped = 0

  for (const row of rows || []) {
    // Second duplicate guard immediately before send.
    // The batch runner is the AUTOMATIC path: nobody is watching it choose, so an
    // address that has already been contacted is skipped outright with no override.
    // A deliberate follow-up is a human decision made per row in the console.
    const address = normalizeAddress(row.contact_email)
    const history = await getRecipientHistory(ctx.admin, address, row.id)
    if (history.contacted) {
      skipped++
      duplicateSkipped++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: duplicateReason(history, address) })
      continue
    }

    if (await alreadySent(ctx.admin, row.id)) {
      skippedCount++
      duplicateSkipped++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: 'Already has outreach_sends record' })
      continue
    }

    const toEmail = cleanEmail(row.contact_email)
    if (!toEmail) {
      skippedCount++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: 'Invalid or low-quality contact_email', contact_email: row.contact_email })
      continue
    }

    const message = applyOutreachSignature(String(row.outreach_message || ''), row.sender_key || 'saasSales')
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) {
      skippedCount++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: safe.reason })
      continue
    }

    if (!send) {
      results.push({ id: row.id, business: row.business_name, businessUrl: row.business_url, source: row.source_platform, createdAt: row.created_at, ok: true, dryRun: true, toEmail, messagePreview: message.slice(0, 220), messageTail: message.slice(-140) })
      continue
    }

    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: `Useful SignalBoost growth preview for ${row.business_name}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(message)}</div>`,
    })

    if (!sent.ok) {
      results.push({ id: row.id, business: row.business_name, ok: false, toEmail, error: sent.error || 'Email send failed', providerResult: sent })
      continue
    }

    const sentAt = new Date().toISOString()
    const { error: insertError } = await ctx.admin.from('outreach_sends').insert({
      outreach_id: row.id,
      business_id: row.business_id,
      channel: 'email',
      sent_at: sentAt,
      metadata: { providerResult: sent, toEmail },
    })

    if (insertError) {
      results.push({ id: row.id, business: row.business_name, ok: false, toEmail, providerResult: sent, error: insertError.message })
      continue
    }

    const queueReconcile = await markOutreachSent(ctx.admin, row.id, sentAt)

    await auditAdminAction({
      admin: ctx.admin,
      actorId: ctx.user.id,
      action: 'outreach.batch_send_ready',
      targetType: 'outreach_queue',
      targetId: row.id,
      metadata: { channel: 'email', providerResult: sent, toEmail, queueReconcile },
    })

    sentCount++
    results.push({
      id: row.id,
      business: row.business_name,
      ok: true,
      sent: true,
      sentAt,
      toEmail,
      providerResult: sent,
      statusUpdated: queueReconcile.ok,
      statusOnlyFallback: queueReconcile.usedStatusOnlyFallback,
      statusUpdateError: queueReconcile.error,
      firstStatusUpdateError: queueReconcile.firstError,
    })
  }

  return NextResponse.json({
    ok: true,
    mode: send ? 'sent' : 'dry_run',
    requestedLimit: limit,
    availableToday,
    candidateRows: candidates?.length || 0,
    alreadySentCandidates: previouslySent.size,
    selected: rows?.length || 0,
    sent: sentCount,
    skipped: skippedCount,
    duplicateSkipped,
    sendLimit: { ...daily, countAfter: daily.count + sentCount },
    selection: { ids: ids.length ? ids : null, sinceHours: sinceHours || null, source: source || null, order: oldestFirst ? 'oldest_first' : 'newest_first' },
    hint: send ? 'Real send attempted. Check outreachSendsRows and Resend Emails.' : 'Dry run only. Append &send=1 to send this batch.',
    results,
  })
}
