// saas/app/api/admin/outreach/selftest/route.ts
// One-shot outreach diagnostic, owner-gated. Open it in the browser while logged in.
//   /api/admin/outreach/selftest                      -> reports state only (no email)
//   /api/admin/outreach/selftest?to=you@x.com&send=1  -> ALSO sends a real test email
// It isolates the email capability (Resend + the saasSales sender) from the outreach
// flow, so we learn in one shot whether sending works and what the queue looks like.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const to = (url.searchParams.get('to') || '').trim()
  const doSend = url.searchParams.get('send') === '1'

  const out: Record<string, any> = { resendKeyConfigured: !!process.env.RESEND_API_KEY }

  try {
    const { count } = await ctx.admin.from('outreach_queue').select('id', { count: 'exact', head: true }).eq('status', 'approved')
    out.approvedDrafts = count || 0
  } catch (e: any) { out.approvedDraftsError = e?.message }

  try {
    const { data, error } = await ctx.admin.from('outreach_queue').select('id,business_name,contact_email,status').eq('status', 'approved').limit(5)
    out.approvedSample = data || null
    if (error) out.approvedSampleError = error.message
  } catch (e: any) { out.approvedSampleError = e?.message }

  try {
    const { count, error } = await ctx.admin.from('outreach_sends').select('id', { count: 'exact', head: true })
    out.outreachSendsRows = count || 0
    if (error) out.outreachSendsError = error.message
  } catch (e: any) { out.outreachSendsError = e?.message }

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
