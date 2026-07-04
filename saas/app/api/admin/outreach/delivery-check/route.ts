// saas/app/api/admin/outreach/delivery-check/route.ts
// Admin-gated delivery checker for outreach emails.
// Looks up Resend message ids stored in outreach_sends and stores observed
// delivery status in outreach_sends.metadata. This does not require any extra
// database migration.

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

async function reconcileQueue(ctx: any, row: any) {
  if (!row?.outreach_id) return { ok: false, error: 'Missing outreach_id' }
  // Production outreach_queue does not have sent_at. Update status only.
  const { data, error } = await ctx.admin
    .from('outreach_queue')
    .update({ status: 'sent' })
    .eq('id', row.outreach_id)
    .select('id,status')
    .maybeSingle()
  return { ok: !error && data?.status === 'sent', error: error?.message || null, row: data || null }
}

async function storeDeliveryOnSend(ctx: any, row: any, resendJson: any, toEmail: string | null) {
  const observedAt = new Date().toISOString()
  const resendStatus = normalizeStatus(resendJson?.last_event || resendJson?.status) || 'sent'
  const existingMetadata = row.metadata || {}
  const delivery = {
    status: resendStatus,
    observedAt,
    source: 'resend_api',
    resendCreatedAt: resendJson?.created_at || null,
    toEmail: toEmail || (Array.isArray(resendJson?.to) ? resendJson.to[0] : resendJson?.to) || null,
    from: resendJson?.from || null,
    subject: resendJson?.subject || null,
  }
  const metadata = { ...existingMetadata, delivery }
  const { data, error } = await ctx.admin
    .from('outreach_sends')
    .update({ metadata })
    .eq('id', row.id)
    .select('id,metadata')
    .maybeSingle()
  return { ok: !error, error: error?.message || null, delivery, row: data || null }
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

  const results: any[] = []
  for (const row of sendRows) {
    const resendId = getProviderId(row)
    const toEmail = getToEmail(row)
    const queueReconcile = await reconcileQueue(ctx, row)

    if (!resendId) {
      results.push({ outreachSendId: row.id, outreachId: row.outreach_id, ok: false, error: 'Missing Resend providerResult.id', sentAt: row.sent_at, toEmail, queueReconcile })
      continue
    }

    const resend = await fetchResendEmail(resendId)
    const resendJson = resend.ok ? resend.json : null
    const resendStatus = normalizeStatus(resendJson?.last_event || resendJson?.status)
    const metadataStatus = normalizeStatus(row?.metadata?.delivery?.status)
    const status = resendStatus || metadataStatus || (resend.ok ? 'sent' : 'unknown')
    const deliveryStore = resend.ok ? await storeDeliveryOnSend(ctx, row, resendJson, toEmail) : { ok: false, error: resend.error, delivery: null }

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
      metadataStatus: deliveryStore.delivery?.status || metadataStatus || null,
      deliveredAt: status === 'delivered' ? deliveryStore.delivery?.observedAt || null : null,
      bouncedAt: status === 'bounced' ? deliveryStore.delivery?.observedAt || null : null,
      complainedAt: status === 'complained' ? deliveryStore.delivery?.observedAt || null : null,
      openedAt: status === 'opened' ? deliveryStore.delivery?.observedAt || null : null,
      clickedAt: status === 'clicked' ? deliveryStore.delivery?.observedAt || null : null,
      bounceType: null,
      openCount: status === 'opened' || status === 'clicked' ? 1 : 0,
      clickCount: status === 'clicked' ? 1 : 0,
      queueReconcile,
      deliveryStatusSynced: deliveryStore.ok,
      deliveryStatusSync: { ok: deliveryStore.ok, error: deliveryStore.error || null, skipped: false, storage: 'outreach_sends.metadata.delivery' },
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
      queueReconciled: results.filter(r => r.queueReconcile?.ok).length,
      deliveryStatusSynced: results.filter(r => r.deliveryStatusSynced).length,
      deliveryStorage: 'outreach_sends.metadata.delivery',
    },
    results,
  })
}
