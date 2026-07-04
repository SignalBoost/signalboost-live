// saas/app/api/admin/outreach/send-ready/route.ts
// Owner/admin-gated batch sender for approved outreach drafts that already have
// a real contact_email. Dry-run by default; append ?send=1 for real sends.
//
// Safety guarantees:
// - never selects rows that already have an outreach_sends record
// - checks again per row before sending to reduce duplicate/race risk
// - records the Resend provider id in outreach_sends
// - marks the outreach_queue row as sent and reports any status-update failure

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { sendEmail } from '@/lib/email'

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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10), 1), 10)

  if (await isOutreachSendingDisabled(ctx.admin)) {
    return NextResponse.json({ ok: false, error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })
  }

  const daily = await enforceDailySendLimit(ctx.admin, 50)
  if (!daily.ok) return NextResponse.json({ ok: false, error: 'Daily outreach send limit reached', sendLimit: daily }, { status: 429 })
  const availableToday = Math.max(0, daily.limit - daily.count)
  const batchLimit = Math.min(limit, availableToday)

  // Fetch more than needed, because some approved rows may have already been sent
  // but still have stale status='approved'. We filter those out below.
  const { data: candidates, error } = await ctx.admin
    .from('outreach_queue')
    .select('id,business_id,business_name,contact_email,outreach_message,status')
    .eq('status', 'approved')
    .not('contact_email', 'is', null)
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

    const message = String(row.outreach_message || '')
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) {
      skippedCount++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: safe.reason })
      continue
    }

    if (!send) {
      results.push({ id: row.id, business: row.business_name, ok: true, dryRun: true, toEmail })
      continue
    }

    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: `Useful SignalBoost growth preview for ${row.business_name}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(message)}</div>`,
    })

    if (!sent.ok) {
      results.push({ id: row.id, business: row.business_name, ok: false, toEmail, error: sent.error || 'Email send failed' })
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

    const { error: updateError } = await ctx.admin
      .from('outreach_queue')
      .update({ status: 'sent', sent_at: sentAt })
      .eq('id', row.id)

    await auditAdminAction({
      admin: ctx.admin,
      actorId: ctx.user.id,
      action: 'outreach.batch_send_ready',
      targetType: 'outreach_queue',
      targetId: row.id,
      metadata: { channel: 'email', providerResult: sent, toEmail, statusUpdateError: updateError?.message || null },
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
      statusUpdated: !updateError,
      statusUpdateError: updateError?.message || null,
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
    hint: send ? 'Real send attempted. Check outreachSendsRows and Resend Emails.' : 'Dry run only. Append &send=1 to send this batch.',
    results,
  })
}
