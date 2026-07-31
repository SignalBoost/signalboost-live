// saas/app/api/cron/outreach-digest/route.ts
//
// DAILY PENDING-APPROVAL DIGEST.
//
// Approval was pull-only: nothing anywhere told the owner that drafts were waiting, so
// fifty of them sat pending for a day while he assumed the pipeline had stopped. This
// closes that loop.
//
// It emails the drafts themselves, not a count. A digest that says "50 drafts pending"
// still requires opening the console to learn anything, which is the same problem in a
// shorter form. Each entry carries the company, its site, the exact recipient address
// and enough of the message body to judge whether it is on-message — so most of the
// review can happen in the inbox, and the console visit is only for the click.
//
// It sends nothing to prospects and changes no record. Read-only, CRON_SECRET-gated.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Enough rows to be useful, few enough that the email stays readable. The count line
// always reports the true total, so a large backlog is never hidden by the cap.
const MAX_ROWS_SHOWN = 15
const BODY_EXCERPT = 420

function ownerEmail(): string {
  const raw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
  return String(raw).split(',')[0]?.trim() || ''
}

function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ))
}

function siteUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SAAS_URL || process.env.SAAS_PUBLIC_URL || '').trim()
  if (!configured) return 'https://saas.signalboostapp.com'
  return /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, '') : `https://${configured.replace(/^\/+|\/+$/g, '')}`
}

function excerpt(message: string): string {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  // Drafts from the older multi-channel generator carry SUBJECT/--- EMAIL --- markers.
  // Strip them so the excerpt starts on the actual first sentence.
  const cleaned = text.replace(/^SUBJECT:.*?--- EMAIL ---\s*/i, '').replace(/---\s*(LINKEDIN|SOCIAL DM)\s*---[\s\S]*$/i, '').trim()
  return cleaned.length > BODY_EXCERPT ? `${cleaned.slice(0, BODY_EXCERPT)}…` : cleaned
}

function renderRow(row: any, base: string): string {
  const name = escapeHtml(row.business_name || 'Unnamed business')
  const url = escapeHtml(row.business_url || '')
  const recipient = row.contact_email
    ? `<span style="color:#0f766e">${escapeHtml(row.contact_email)}</span>`
    : `<span style="color:#b45309">no published email found — cannot be sent</span>`
  const created = row.created_at ? new Date(row.created_at).toISOString().slice(0, 16).replace('T', ' ') : ''

  return `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
      <div style="font-weight:600;font-size:15px;color:#111827">${name}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">${url}${created ? ` &middot; ${escapeHtml(created)} UTC` : ''}</div>
      <div style="font-size:12px;margin-top:4px">To: ${recipient}</div>
      <div style="font-size:13px;color:#374151;line-height:1.55;margin-top:8px">${escapeHtml(excerpt(row.outreach_message))}</div>
    </td></tr>`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'Supabase service role is not configured.' }, { status: 500 })
  }
  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error, count } = await admin
    .from('outreach_queue')
    .select('id,business_name,business_url,contact_email,outreach_message,created_at', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS_SHOWN)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = data || []
  const total = typeof count === 'number' ? count : rows.length
  // Nothing waiting is not worth an email. A daily "you have 0 drafts" trains the
  // recipient to ignore the whole digest, which defeats its purpose.
  if (!total) return NextResponse.json({ ok: true, pending: 0, sent: false })

  const to = ownerEmail()
  if (!to) return NextResponse.json({ ok: false, error: 'No owner address configured (set OWNER_EMAILS).' }, { status: 500 })

  const base = siteUrl()
  const link = `${base}/dashboard/outreach/contacts`
  const shown = rows.length
  const remaining = Math.max(0, total - shown)

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">SignalBoost outreach</p>
    <h2 style="font-size:20px;margin:0 0 6px">${total} draft${total === 1 ? '' : 's'} waiting for your approval</h2>
    <p style="font-size:13px;color:#4b5563;margin:0 0 18px">
      Nothing has been sent. These are drafts only — each one still needs Approve &amp; Send.
    </p>
    <table style="width:100%;border-collapse:collapse">${rows.map(row => renderRow(row, base)).join('')}</table>
    ${remaining ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0">…and ${remaining} more not shown here.</p>` : ''}
    <p style="margin:22px 0 0">
      <a href="${link}" style="background:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;display:inline-block">Review and approve</a>
    </p>
    <p style="font-size:12px;color:#9ca3af;margin:18px 0 0">${escapeHtml(link)}</p>
  </div>`

  const result = await sendEmail({
    from: 'saasSales',
    to,
    subject: `${total} outreach draft${total === 1 ? '' : 's'} waiting for approval`,
    html,
  })

  if (!result.ok) {
    console.error('cron outreach-digest send failed:', result.error)
    return NextResponse.json({ ok: false, pending: total, sent: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pending: total, shown, sent: true, to })
}
