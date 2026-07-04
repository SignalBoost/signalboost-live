// saas/app/api/admin/outreach/delivery-check/route.ts
// Owner/admin-gated read-only delivery checker for outreach emails.
// Uses RESEND_API_KEY to look up Resend message ids stored in outreach_sends.
// It never sends email, never exposes API keys, and merges webhook rollup state
// from email_delivery_status when available.

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

function deriveWebhookStatus(st: any): string | null {
  if (!st) return null
  if (st.bounced_at) return 'bounced'
  if (st.complained_at) return 'complained'
  if (st.opened_at) return 'opened'
  if (st.delivered_at) return 'delivered'
  if (st.sent_at) return 'sent'
  return st.last_event || null
}

async function fetchResendEmail(id: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false as const, error: 'RESEND_API_KEY is not configured' }

  const res = await fetch(`${RESEND_API}/emails/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) return { ok: false as const, error: `Resend ${res.status}: ${text.slice(0, 300)}` }
  return { ok: true as const, json: text ? JSON.parse(text) : {} }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1), 25)
  const rawIds = (url.searchParams.get('ids') || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 25)

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
    const { data: statuses } = await ctx.admin
      .from('email_delivery_status')
      .select('*')
      .in('resend_email_id', resendIds)
    for (const st of statuses || []) statusById[(st as any).resend_email_id] = st
  }

  const results: any[] = []
  for (const row of sendRows) {
    const resendId = getProviderId(row)
    const toEmail = getToEmail(row)
    if (!resendId) {
      results.push({ outreachSendId: row.id, outreachId: row.outreach_id, ok: false, error: 'Missing Resend providerResult.id', sentAt: row.sent_at, toEmail })
      continue
    }

    const webhook = statusById[resendId] || null
    const resend = await fetchResendEmail(resendId)
    const resendJson = resend.ok ? resend.json : null
    const resendStatus = resendJson?.last_event || resendJson?.status || null
    const webhookStatus = deriveWebhookStatus(webhook)
    const status = webhookStatus || resendStatus || (resend.ok ? 'sent' : 'unknown')

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
      webhookStatus,
      deliveredAt: webhook?.delivered_at || null,
      bouncedAt: webhook?.bounced_at || null,
      complainedAt: webhook?.complained_at || null,
      openedAt: webhook?.opened_at || null,
      clickedAt: webhook?.clicked_at || null,
      bounceType: webhook?.bounce_type || null,
      openCount: webhook?.open_count || 0,
      clickCount: webhook?.click_count || 0,
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
    },
    results,
  })
}
