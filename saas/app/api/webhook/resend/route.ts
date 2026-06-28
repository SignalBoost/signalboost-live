// saas/app/api/webhook/resend/route.ts
//
// Resend delivery webhook.
//
// Resend POSTs a signed event here every time one of our emails changes state
// (sent, delivered, bounced, complained, opened, clicked, ...). We:
//   1. Verify the Svix signature (Resend signs webhooks with Svix). No valid
//      signature => 401, nothing written. We never accept unsigned events.
//   2. Append the raw event to email_delivery_events (the audit trail).
//   3. Roll the event up into email_delivery_status (one row per email id),
//      setting first-occurrence timestamps and counters.
//   4. Reconcile the email id back to the originating outreach row, so the
//      outreach view can show real delivery state instead of just "sent".
//
// Configure once in the Resend dashboard:
//   Endpoint: https://www.saas.signalboostapp.com/api/webhook/resend
//   Signing secret -> env RESEND_WEBHOOK_SECRET   (looks like "whsec_...")
//
// We verify the signature manually (the `svix` package is not a dependency).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Svix signature verification ─────────────────────────────────────────────
// Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`. The secret is
// base64 after the "whsec_" prefix. The svix-signature header may carry several
// space-separated `v1,<base64>` signatures; we accept if ANY matches.
function verifySvix(rawBody: string, headers: Headers): { ok: boolean; reason?: string } {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return { ok: false, reason: 'RESEND_WEBHOOK_SECRET not configured' }

  const id = headers.get('svix-id') || ''
  const timestamp = headers.get('svix-timestamp') || ''
  const sigHeader = headers.get('svix-signature') || ''
  if (!id || !timestamp || !sigHeader) return { ok: false, reason: 'Missing svix headers' }

  // Generous replay guard: reject only absurdly old timestamps (clock skew safe).
  const ts = Number(timestamp)
  if (Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) > 60 * 60) {
    return { ok: false, reason: 'Timestamp outside tolerance' }
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${id}.${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')
  const expectedBuf = Buffer.from(expected)

  const provided = sigHeader.split(' ')
  for (const part of provided) {
    const sig = part.includes(',') ? part.split(',')[1] : part
    if (!sig) continue
    const sigBuf = Buffer.from(sig)
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: true }
    }
  }
  return { ok: false, reason: 'No matching signature' }
}

// Map a Resend event type to the first-occurrence timestamp column it fills.
const TS_COLUMN: Record<string, string> = {
  'email.sent': 'sent_at',
  'email.delivered': 'delivered_at',
  'email.bounced': 'bounced_at',
  'email.complained': 'complained_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const verified = verifySvix(rawBody, req.headers)
  if (!verified.ok) {
    // 401 => Resend will not treat this as a transient failure to retry.
    return NextResponse.json({ error: verified.reason || 'Invalid signature' }, { status: 401 })
  }

  let evt: any
  try { evt = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const type: string = String(evt?.type || 'unknown')
  const data: any = evt?.data || {}
  const emailId: string | null = data.email_id || data.id || null
  const toEmail: string | null = Array.isArray(data.to) ? (data.to[0] || null) : (data.to || null)
  const subject: string | null = data.subject || null
  const occurredAt: string | null = evt?.created_at || data.created_at || null
  const bounceType: string | null =
    type === 'email.bounced'
      ? (data?.bounce?.type || data?.bounce?.subType || data?.bounce_type || null)
      : null

  const supabase = adminClient()

  // 2. Append-only raw event. If this fails, return 500 so Resend retries and we
  //    do not lose the signal.
  const { error: evtErr } = await supabase.from('email_delivery_events').insert({
    resend_email_id: emailId,
    event_type: type,
    to_email: toEmail,
    subject,
    bounce_type: bounceType,
    occurred_at: occurredAt,
    payload: evt ?? {},
  })
  if (evtErr) {
    return NextResponse.json({ error: 'event log failed' }, { status: 500 })
  }

  // Without an email id we can log but cannot roll up. Acknowledge so Resend
  // does not retry a non-recoverable event.
  if (!emailId) return NextResponse.json({ ok: true, rolledUp: false })

  // 4. Resolve the originating outreach (once) via the stored Resend message id.
  let outreachId: string | null = null
  {
    const { data: send } = await supabase
      .from('outreach_sends')
      .select('outreach_id')
      .filter('metadata->providerResult->>id', 'eq', emailId)
      .limit(1)
      .maybeSingle()
    outreachId = (send as any)?.outreach_id || null
  }

  // 3. Roll up into per-email status (first-occurrence timestamps + counters).
  const { data: existing } = await supabase
    .from('email_delivery_status')
    .select('*')
    .eq('resend_email_id', emailId)
    .maybeSingle()

  const prior: any = existing || {}
  const tsCol = TS_COLUMN[type]
  const nowEvent = occurredAt || new Date().toISOString()

  const row: Record<string, any> = {
    resend_email_id: emailId,
    to_email: prior.to_email || toEmail,
    last_event: type,
    last_event_at: nowEvent,
    sent_at: prior.sent_at ?? null,
    delivered_at: prior.delivered_at ?? null,
    bounced_at: prior.bounced_at ?? null,
    complained_at: prior.complained_at ?? null,
    opened_at: prior.opened_at ?? null,
    clicked_at: prior.clicked_at ?? null,
    bounce_type: prior.bounce_type ?? null,
    open_count: prior.open_count ?? 0,
    click_count: prior.click_count ?? 0,
    outreach_id: prior.outreach_id ?? outreachId,
  }

  // Fill the first-occurrence timestamp for this event type (only if empty).
  if (tsCol && !row[tsCol]) row[tsCol] = nowEvent
  if (type === 'email.bounced' && bounceType) row.bounce_type = bounceType
  // Counters. (v1 note: a rare Resend retry of the SAME open/click event can
  // over-count by one; delivery/bounce state is unaffected because those use
  // first-occurrence timestamps.)
  if (type === 'email.opened') row.open_count = (prior.open_count ?? 0) + 1
  if (type === 'email.clicked') row.click_count = (prior.click_count ?? 0) + 1

  const { error: upErr } = await supabase
    .from('email_delivery_status')
    .upsert(row, { onConflict: 'resend_email_id' })
  if (upErr) {
    // The raw event is already saved; report so Resend retries the rollup.
    return NextResponse.json({ error: 'rollup failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, rolledUp: true, type })
}

// Resend may probe the endpoint with a GET; respond cheaply.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'resend-webhook' })
}
