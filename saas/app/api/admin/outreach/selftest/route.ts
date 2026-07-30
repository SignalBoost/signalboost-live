// saas/app/api/admin/outreach/selftest/route.ts
// One-shot outreach diagnostic, owner-gated. Open it in the browser while logged in.
//   /api/admin/outreach/selftest                      -> reports state only (no email)
//   /api/admin/outreach/selftest?to=you@x.com&send=1  -> ALSO sends a real test email
// It isolates the email capability (Resend + the saasSales sender) from the outreach
// flow, so we learn in one shot whether sending works and what the queue/history contain.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

async function countRows(admin: any, table: string, filter?: (query: any) => any) {
  try {
    let query = admin.from(table).select('id', { count: 'exact', head: true })
    if (filter) query = filter(query)
    const { count, error } = await query
    return { count: count || 0, error: error?.message || null }
  } catch (error: any) {
    return { count: 0, error: error?.message || 'count failed' }
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const to = (url.searchParams.get('to') || '').trim()
  const doSend = url.searchParams.get('send') === '1'

  const [approved, sentQueue, sends, deliveryEvents, deliveryStatuses, replies] = await Promise.all([
    countRows(ctx.admin, 'outreach_queue', q => q.eq('status', 'approved')),
    countRows(ctx.admin, 'outreach_queue', q => q.eq('status', 'sent')),
    countRows(ctx.admin, 'outreach_sends'),
    countRows(ctx.admin, 'email_delivery_events'),
    countRows(ctx.admin, 'email_delivery_status'),
    countRows(ctx.admin, 'outreach_replies'),
  ])

  const out: Record<string, any> = {
    resendKeyConfigured: !!process.env.RESEND_API_KEY,
    resendWebhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
    replyToConfigured: !!(
      process.env.EMAIL_REPLY_TO ||
      process.env.REPLY_TO_EMAIL ||
      process.env.OWNER_EMAILS ||
      process.env.OWNER_EMAIL ||
      process.env.SIGNALBOOST_OWNER_EMAIL ||
      process.env.ADMIN_EMAIL
    ),
    approvedDrafts: approved.count,
    sentQueueRows: sentQueue.count,
    outreachSendsRows: sends.count,
    deliveryEventRows: deliveryEvents.count,
    deliveryStatusRows: deliveryStatuses.count,
    replyRows: replies.count,
    diagnostics: {
      approvedDraftsError: approved.error,
      sentQueueRowsError: sentQueue.error,
      outreachSendsError: sends.error,
      deliveryEventsError: deliveryEvents.error,
      deliveryStatusesError: deliveryStatuses.error,
      repliesError: replies.error,
    },
  }

  try {
    const { data, error } = await ctx.admin
      .from('outreach_queue')
      .select('id,business_name,contact_email,status,approved_at')
      .eq('status', 'approved')
      .limit(5)
    out.approvedSample = data || null
    if (error) out.approvedSampleError = error.message
  } catch (error: any) {
    out.approvedSampleError = error?.message
  }

  try {
    const { data, error } = await ctx.admin
      .from('outreach_sends')
      .select('id,outreach_id,channel,sent_at,metadata')
      .order('sent_at', { ascending: false })
      .limit(5)
    out.recentSendSample = data || null
    if (error) out.recentSendSampleError = error.message
  } catch (error: any) {
    out.recentSendSampleError = error?.message
  }

  if (doSend && to) {
    out.testSend = await sendEmail({
      from: 'saasSales',
      to,
      subject: 'SignalBoost send self-test',
      html: '<p>SignalBoost send self-test from saassales@signalboostapp.com. If this arrived, Resend and the sender are working.</p>',
    })
  } else {
    out.testSendHint = 'Append ?to=you@example.com&send=1 to send a real test email.'
  }

  return NextResponse.json({ ok: true, ...out })
}
