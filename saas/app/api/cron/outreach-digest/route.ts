// saas/app/api/cron/outreach-digest/route.ts
//
// DAILY PENDING-APPROVAL DIGEST, AND THE THINGS THAT STOP SPENDING SILENTLY.
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
// PAID ADVERTISING RIDES ALONG, for the same reason and with the same shape. A token
// expiring, a credit line filling, an invoice going past due or a card lapsing all stop
// delivery without producing a single error — the network keeps answering our questions
// correctly, it just is not running the ads. Those need to reach a person days early, and
// the inbox is where a person actually is.
//
// TWO RULES KEPT FROM THE ORIGINAL. Nothing worth saying means no email at all: a daily
// "you have 0 drafts and 0 alerts" trains the recipient to ignore the whole thing. And the
// digest sends nothing to prospects and changes no record — read-only, CRON_SECRET-gated.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { collectAdsAttention } from '@/lib/ads/ads-attention'
import { listAccountHealth, listCampaignPositions } from '@/lib/ads/spend-ledger'

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

/**
 * The ad alerts worth an email.
 *
 * Only critical and warning items travel: an informational note like "92% of the cap is
 * spent" belongs on the page, not in an inbox, and padding the digest with those is how it
 * stops being read.
 *
 * Never throws. A deployment that has not run the ads migrations, or has no ad networks at
 * all, must still receive its outreach digest — the ads half is an addition to this email,
 * not a precondition for it.
 */
async function adsAlerts(admin: any): Promise<any[]> {
  try {
    const [health, positions] = await Promise.all([
      listAccountHealth(admin),
      listCampaignPositions(admin),
    ])
    const campaigns = (positions || []).map((row: any) => ({
      id: row.id,
      platformId: row.platform_id,
      accountRef: row.account_ref,
      name: row.name,
      status: row.status,
      currency: row.currency,
      capMinor: Number(row.campaign_max_minor),
      spentMinor: Number(row.reported_spend_minor),
      overCap: row.over_cap === true,
      lastReconciledAt: row.last_reconciled_at,
      reconcileError: row.reconcile_error,
    }))
    return collectAdsAttention({ health: health || [], campaigns }).filter(item => item.severity !== 'info')
  } catch {
    return []
  }
}

function renderAlert(item: any): string {
  const critical = item.severity === 'critical'
  return `
    <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
      <div style="font-size:13px;color:${critical ? '#b91c1c' : '#b45309'};font-weight:600">
        ${critical ? '&#9888;' : '&middot;'} ${escapeHtml(item.subject)}
      </div>
      <div style="font-size:13px;color:#374151;line-height:1.55;margin-top:3px">${escapeHtml(item.message)}</div>
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
  const alerts = await adsAlerts(admin)
  const criticals = alerts.filter(item => item.severity === 'critical').length

  // Nothing waiting is not worth an email. A daily "you have 0 drafts" trains the
  // recipient to ignore the whole digest, which defeats its purpose. Ads alerts count as
  // something waiting — an expiring token needs an email even on a day with no drafts.
  if (!total && !alerts.length) return NextResponse.json({ ok: true, pending: 0, alerts: 0, sent: false })

  const to = ownerEmail()
  if (!to) return NextResponse.json({ ok: false, error: 'No owner address configured (set OWNER_EMAILS).' }, { status: 500 })

  const base = siteUrl()
  const link = `${base}/dashboard/outreach/contacts`
  const adsLink = `${base}/dashboard/ads`
  const shown = rows.length
  const remaining = Math.max(0, total - shown)

  // Alerts lead when any of them is critical: a card that expired yesterday matters more
  // than a draft that can wait another day.
  const alertsFirst = criticals > 0

  const alertsBlock = alerts.length
    ? `
    <h2 style="font-size:${alertsFirst ? '20' : '17'}px;margin:${alertsFirst ? '0 0 6px' : '28px 0 6px'}">
      ${alerts.length} advertising alert${alerts.length === 1 ? '' : 's'}${criticals ? ` &middot; ${criticals} need${criticals === 1 ? 's' : ''} action now` : ''}
    </h2>
    <p style="font-size:13px;color:#4b5563;margin:0 0 12px">
      Each of these stops delivery without producing an error. The network keeps answering normally — it just stops running the ads.
    </p>
    <table style="width:100%;border-collapse:collapse">${alerts.map(renderAlert).join('')}</table>
    <p style="margin:14px 0 0">
      <a href="${adsLink}" style="background:#b45309;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;display:inline-block">Open the ads cockpit</a>
    </p>`
    : ''

  const draftsBlock = total
    ? `
    <h2 style="font-size:${alertsFirst ? '17' : '20'}px;margin:${alertsFirst ? '28px 0 6px' : '0 0 6px'}">${total} draft${total === 1 ? '' : 's'} waiting for your approval</h2>
    <p style="font-size:13px;color:#4b5563;margin:0 0 18px">
      Nothing has been sent. These are drafts only — each one still needs Approve &amp; Send.
    </p>
    <table style="width:100%;border-collapse:collapse">${rows.map(row => renderRow(row, base)).join('')}</table>
    ${remaining ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0">…and ${remaining} more not shown here.</p>` : ''}
    <p style="margin:22px 0 0">
      <a href="${link}" style="background:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;display:inline-block">Review and approve</a>
    </p>
    <p style="font-size:12px;color:#9ca3af;margin:18px 0 0">${escapeHtml(link)}</p>`
    : ''

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">SignalBoost outreach</p>
    ${alertsFirst ? alertsBlock + draftsBlock : draftsBlock + alertsBlock}
  </div>`

  // The subject says what is actually in the email. A fixed subject that mentions drafts on
  // a day with none, or omits an expired token, is the reason digests stop being opened.
  const parts: string[] = []
  if (total) parts.push(`${total} outreach draft${total === 1 ? '' : 's'} waiting`)
  if (alerts.length) parts.push(`${alerts.length} ads alert${alerts.length === 1 ? '' : 's'}`)
  const subject = criticals ? `Action needed — ${parts.join(' · ')}` : parts.join(' · ')

  const result = await sendEmail({
    from: 'saasSales',
    to,
    subject,
    html,
  })

  if (!result.ok) {
    console.error('cron outreach-digest send failed:', result.error)
    return NextResponse.json({ ok: false, pending: total, alerts: alerts.length, sent: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pending: total, shown, alerts: alerts.length, criticals, sent: true, to })
}
