// saas/app/api/admin/outreach/delivery-check/route.ts
// Admin-gated delivery checker for outreach emails.
// Looks up Resend message ids stored in outreach_sends and mirrors the observed
// status into email_delivery_status when webhook rollup is missing.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RESEND_API = 'https://api.resend.com'

function getProviderId(row: any): string | null {
  const metadata = row?.metadata || {}
  const id = metadata?.providerResult?.id || metadata?.resendId || metadata?.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function getToEmail(row: any): string | null {
  const metadata = row?.metadata || {}
  const email = metadata?.toEmail || metadata?.to_email || metadata?.recipient
  return typeof email === 'string' && email.trim() ? email.trim() : null
}

function normalizeStatus(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes('bounced')) return 'bounced'
  if (raw.includes('complained')) return 'complained'
  if (raw.includes('clicked')) return 'clicked'
  if (raw.includes('opened')) return 'opened'
  if (raw.includes('delivered')) return 'delivered'
  if (raw.includes('sent')) return 'sent'
  return raw.replace(/^email\./, '')
}

function deriveTrackedStatus(st: any): string | null {
  if (!st) return null
  if (st.bounced_at) return 'bounced'
  if (st.complained_at) return 'complained'
  if (st.clicked_at) return 'clicked'
  if (st.opened_at) return 'opened'
  if (st.delivered_at) return 'delivered'
  if (st.sent_at) return 'sent'
  return normalizeStatus(st.last_event)
}

function eventName(status: string | null): string {
  return `email.${status || 'sent'}`
}

async function fetchResendEmail(id: string) {
  const token = process.env.RESEND_API_KEY
  if (!token) return { ok: false as const, error: 'RESEND_API_KEY is not configured' }
  const res = await fetch(`${RESEND_API}/emails/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) return { ok: false as const, error: `Resend ${res.status}: ${text.slice(0, 300)}` }
  return { ok: true as const, json: text ? JSON.parse(text) : {} }
}

async function mirrorStatus(ctx: any, row: any, resendId: string, resendJson: any, existing: any, toEmail: string | null) {
  const observedAt = new Date().toISOString()
  const resendStatus = normalizeStatus(resendJson?.last_event || resendJson?.status)
  const status = deriveTrackedStatus(existing) || resendStatus || 'sent'
  const deliveredLike = ['delivered', 'opened', 'clicked'].includes(status)
  const tracked = {
    resend_email_id: resendId,
    to_email: existing?.to_email || toEmail || (Array.isArray(resendJson?.to) ? resendJson.to[0] : resendJson?.to) || null,
    last_event: eventName(status),
    last_event_at: existing?.last_event_at || observedAt,
    sent_at: existing?.sent_at || row.sent_at || resendJson?.created_at || observedAt,
    delivered_at: existing?.delivered_at || (deliveredLike ? observedAt : null),
    bounced_at: existing?.bounced_at || (status === 'bounced' ? observedAt : null),
    complained_at: existing?.complained_at || (status === 'complained' ? observedAt : null),
    opened_at: existing?.opened_at || (status === 'opened' || status === 'clicked' ? observedAt : null),
    clicked_at: existing?.clicked_at || (status === 'clicked' ? observedAt : null),
    bounce_type: existing?.bounce_type || null,
    open_count: existing?.open_count || (status === 'opened' || status === 'clicked' ? 1 : 0),
    click_count: existing?.click_count || (status === 'clicked' ? 1 : 0),
    outreach_id: existing?.outreach_id || row.outreach_id || null,
    metadata: { ...(existing?.metadata || {}), resend_api_sync: { observed_at: observedAt, resend_status: resendStatus } },
  }
  const { error } = await ctx.admin.from('email_delivery_status').upsert(tracked, { onConflict: 'resend_email_id' })
  return { ok: !error, error: error?.message || null, tracked }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1), 25)
  const rawIds = (url.searchParams.get('ids') || '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 25)

  let sendRows: any[] = []
  if (rawIds.length) {
    const { data, error } = await ctx.admin
      .from('outreach_sends')
      .select('id,outreach_id,business_id,channel,sent_at,metadata')
      .in('metadata->providerResult->>id', rawIds)
      .order('sent_at', { ascending: false })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    sendRows = data || []
  } else {
    const { data, error } = await ctx.admin
      .from('outreach_sends')
      .select('id,outreach_id,business_id,channel,sent_at,metadata')
      .order('sent_at', { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    sendRows = data || []
  }

  const resendIds = sendRows.map(getProviderId).filter(Boolean) as string[]
  const statusById: Record<string, any> = {}
  if (resendIds.length) {
    const { data: statuses } = await ctx.admin.from('email_delivery_status').select('*').in('resend_email_id', resendIds)
    for (const st of statuses || []) statusById[(st as any).resend_email_id] = st
  }

  const results: any[] = []
  for (const row of sendRows) {
    const resendId = getProviderId(row)
    const toEmail = getToEmail(row)

    if (row.outreach_id) {
      await ctx.admin.from('outreach_queue').update({ status: 'sent', sent_at: row.sent_at || new Date().toISOString() }).eq('id', row.outreach_id)
    }

    if (!resendId) {
      results.push({ outreachSendId: row.id, outreachId: row.outreach_id, ok: false, error: 'Missing Resend providerResult.id', sentAt: row.sent_at, toEmail })
      continue
    }

    const resend = await fetchResendEmail(resendId)
    const resendJson = resend.ok ? resend.json : null
    const existing = statusById[resendId] || null
    let sync: any = { ok: false, skipped: true }
    if (resend.ok) {
      sync = await mirrorStatus(ctx, row, resendId, resendJson, existing, toEmail)
      if (sync.ok) statusById[resendId] = sync.tracked
    }

    const tracked = statusById[resendId] || existing || null
    const resendStatus = normalizeStatus(resendJson?.last_event || resendJson?.status)
    const trackedStatus = deriveTrackedStatus(tracked)
    const status = trackedStatus || resendStatus || (resend.ok ? 'sent' : 'unknown')

    results.push({
      outreachSendId: row.id,
      outreachId: row.outreach_id,
      resendId,
      ok: resend.ok,
      toEmail: toEmail || (Array.isArray(resendJson?.to) ? resendJson.to[0] : resendJson?.to) || null,
      from: resendJson?.from || null,
      subject: resendJson?.subject || null,
      sentAt: row.sent_at,
      resendCreatedAt: resendJson?.created_at || null,
      status,
      resendStatus,
      webhookStatus: trackedStatus,
      deliveredAt: tracked?.delivered_at || null,
      bouncedAt: tracked?.bounced_at || null,
      complainedAt: tracked?.complained_at || null,
      openedAt: tracked?.opened_at || null,
      clickedAt: tracked?.clicked_at || null,
      bounceType: tracked?.bounce_type || null,
      openCount: tracked?.open_count || 0,
      clickCount: tracked?.click_count || 0,
      deliveryStatusSync: { ok: sync.ok, error: sync.error || null, skipped: !!sync.skipped },
      error: resend.ok ? null : resend.error,
    })
  }

  const hasStatus = (needle: string) => results.filter(r => String(r.status || '').includes(needle)).length
  return NextResponse.json({
    ok: true,
    checked: results.length,
    summary: {
      sentOrAccepted: results.filter(r => r.ok).length,
      delivered: hasStatus('delivered'),
      bounced: hasStatus('bounced'),
      complained: hasStatus('complained'),
      opened: hasStatus('opened'),
      unknown: results.filter(r => !r.status || r.status === 'unknown').length,
      deliveryStatusSynced: results.filter(r => r.deliveryStatusSync?.ok).length,
    },
    results,
  })
}
