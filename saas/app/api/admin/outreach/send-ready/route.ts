// saas/app/api/admin/outreach/send-ready/route.ts
// Owner/admin-gated batch sender for approved outreach drafts that already have
// a real contact_email. Dry-run by default; append ?send=1 for real sends.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { applyOutreachSignature } from '@/lib/outreach/signature'
import { getRecipientHistory, duplicateReason, normalizeAddress } from '@/lib/outreach/recipientHistory'
import { sendEmail } from '@/lib/email'
import { markOutreachSent } from '@/lib/outreach/markSent'
import { reportLangFromCookie } from '@/lib/i18n/reportLanguage'
import { localizeOutreachMessages } from '@/lib/outreach/localeOutreach'

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
  const locale = reportLangFromCookie(req.headers.get('cookie'))
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10), 1), 50)

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
  const availableToday = daily.unlimited ? limit : Math.max(0, daily.limit - daily.count)
  const batchLimit = daily.unlimited ? limit : Math.min(limit, availableToday)

  let query = ctx.admin
    .from('outreach_queue')
    .select('id,business_id,business_name,business_url,contact_email,outreach_message,status,sender_key,source_platform,product_key,created_at')
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

  // One shared locale pass for the selected batch. The language chosen by the user now
  // governs both dry-run preview and real send. No region or language is hardcoded here.
  const localizationInput = rows.flatMap((row: any) => [
    { id: `body:${row.id}`, text: String(row.outreach_message || '') },
    { id: `subject:${row.id}`, text: `Useful SignalBoost growth preview for ${row.business_name}` },
  ])
  const localized = await localizeOutreachMessages(localizationInput, locale)

  const results: any[] = []
  let sentCount = 0
  let skippedCount = 0
  let duplicateSkipped = 0

  for (const row of rows || []) {
    const address = normalizeAddress(row.contact_email)
    const history = await getRecipientHistory(ctx.admin, address, row.id, row.product_key)
    if (history.contacted) {
      skippedCount++
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

    const localizedBody = localized.messages.get(`body:${row.id}`) || String(row.outreach_message || '')
    const localizedSubject = localized.messages.get(`subject:${row.id}`) || `Useful SignalBoost growth preview for ${row.business_name}`
    const message = applyOutreachSignature(localizedBody, row.sender_key || 'saasSales', locale)
    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) {
      skippedCount++
      results.push({ id: row.id, business: row.business_name, ok: false, skipped: true, reason: safe.reason })
      continue
    }

    if (!send) {
      results.push({
        id: row.id,
        business: row.business_name,
        businessUrl: row.business_url,
        source: row.source_platform,
        createdAt: row.created_at,
        ok: true,
        dryRun: true,
        toEmail,
        locale,
        messagePreview: message.slice(0, 220),
        messageTail: message.slice(-140),
      })
      continue
    }

    if (localizedBody !== String(row.outreach_message || '')) {
      const { error: localizedSaveError } = await ctx.admin
        .from('outreach_queue')
        .update({ outreach_message: localizedBody })
        .eq('id', row.id)
        .eq('status', 'approved')
      if (localizedSaveError) {
        results.push({ id: row.id, business: row.business_name, ok: false, toEmail, error: localizedSaveError.message })
        continue
      }
    }

    const sent = await sendEmail({
      from: 'saasSales',
      to: toEmail,
      subject: localizedSubject,
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
      metadata: { providerResult: sent, toEmail, locale, localized: !localized.failed.includes(`body:${row.id}`) },
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
      metadata: { channel: 'email', providerResult: sent, toEmail, locale, queueReconcile },
    })

    sentCount++
    results.push({
      id: row.id,
      business: row.business_name,
      ok: true,
      sent: true,
      sentAt,
      toEmail,
      locale,
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
    locale,
    requestedLimit: limit,
    availableToday,
    candidateRows: candidates?.length || 0,
    alreadySentCandidates: previouslySent.size,
    selected: rows?.length || 0,
    sent: sentCount,
    skipped: skippedCount,
    duplicateSkipped,
    localizationFailed: localized.failed,
    sendLimit: { ...daily, countAfter: daily.count + sentCount },
    selection: { ids: ids.length ? ids : null, sinceHours: sinceHours || null, source: source || null, order: oldestFirst ? 'oldest_first' : 'newest_first' },
    hint: send ? 'Real send attempted. Check outreachSendsRows and Resend Emails.' : 'Dry run only. Append &send=1 to send this batch.',
    results,
  })
}
