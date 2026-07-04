// saas/app/api/cos/campaign-queue/email-action/route.ts
// Secure owner email actions for COSA video approvals.
// Supports:
//   - approve: approve final branded preview and trigger auto-publish
//   - hold: keep campaign in waiting_approval and mark it on hold
//   - changes: collect comments/edit request and keep campaign in waiting_approval

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { autoPublishApprovedCampaign } from '@/lib/cos/campaign-queue/publish-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type EmailAction = 'approve' | 'hold' | 'changes'

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function secret() {
  return process.env.COS_EMAIL_APPROVAL_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-secret'
}

function sign(campaignId: string, ownerUserId: string, ownerEmail: string) {
  return createHmac('sha256', secret()).update(`${campaignId}:${ownerUserId}:${ownerEmail}`).digest('hex')
}

function validToken(token: string, campaignId: string, ownerUserId: string, ownerEmail: string) {
  const expected = sign(campaignId, ownerUserId, ownerEmail)
  const a = Buffer.from(token || '', 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function html(title: string, body: string, status = 200) {
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#020617;color:#fff;font-family:Arial,sans-serif"><main style="max-width:760px;margin:0 auto;padding:32px"><section style="background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px"><p style="color:#ffc300;font-weight:900;letter-spacing:.12em;text-transform:uppercase;font-size:12px;margin:0 0 10px">SignalBoostAi COSA</p>${body}</section></main></body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function clean(value: FormDataEntryValue | string | null, max = 1600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function finalVideoReady(campaign: any) {
  const v = campaign?.metadata?.video || {}
  return v.status === 'ready' && v.branded === true && Boolean(v.voicedUrl)
}

function actionParams(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const id = clean(q.get('id'), 80)
  const actionRaw = clean(q.get('action'), 40)
  const action: EmailAction = actionRaw === 'approve' || actionRaw === 'hold' || actionRaw === 'changes' ? actionRaw : 'changes'
  const owner = clean(q.get('owner'), 120)
  const email = clean(q.get('email'), 200).toLowerCase()
  const token = clean(q.get('token'), 200)
  return { id, action, owner, email, token }
}

function dashboardLink(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  return `${origin}/dashboard/cosa/video-pipeline`
}

async function loadCampaign(sb: ReturnType<typeof admin>, id: string) {
  const { data, error } = await sb.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !data) return { ok: false, error: error?.message || 'Campaign not found.', campaign: null as any }
  return { ok: true, error: '', campaign: data }
}

async function approveCampaign(req: NextRequest, sb: ReturnType<typeof admin>, campaign: any, ownerUserId: string, ownerEmail: string) {
  if (!finalVideoReady(campaign)) {
    return html('Approval blocked', '<h1 style="margin-top:0">Approval blocked</h1><p>The final branded preview is not ready yet. The campaign must have voice/captions plus the SignalBoostAi and www.saas.signalboostapp.com banner before email approval works.</p>', 409)
  }

  const now = new Date().toISOString()
  const metadata = {
    ...(campaign.metadata || {}),
    emailApproval: {
      state: 'approved',
      approvedAt: now,
      ownerEmail,
      ownerUserId,
      source: 'email_link',
    },
  }

  const { error } = await sb.from('cos_campaign_queue').update({
    status: 'approved',
    approved_by: ownerUserId,
    approved_at: now,
    metadata,
  }).eq('id', campaign.id)

  if (error) return html('Approval failed', `<h1 style="margin-top:0">Approval failed</h1><p>${error.message}</p>`, 500)

  let autoPublish: any = null
  try {
    autoPublish = await autoPublishApprovedCampaign({ admin: sb, userId: ownerUserId, userEmail: ownerEmail, campaignId: campaign.id })
  } catch (e: any) {
    autoPublish = { attempted: 0, published: 0, results: [{ ok: false, error: e?.message || 'Auto-publish crashed' }] }
  }

  return html('Approved', `<h1 style="margin-top:0;color:#34d399">Approved</h1><p>COSA marked this campaign approved and started the automatic publishing workflow.</p><p><strong>Auto-publish:</strong> ${clean(JSON.stringify(autoPublish), 900)}</p><p><a href="${dashboardLink(req)}" style="color:#1af0ff">Open COSA video pipeline</a></p>`)
}

async function holdCampaign(req: NextRequest, sb: ReturnType<typeof admin>, campaign: any, ownerUserId: string, ownerEmail: string) {
  const now = new Date().toISOString()
  const metadata = {
    ...(campaign.metadata || {}),
    emailApproval: {
      state: 'hold',
      heldAt: now,
      ownerEmail,
      ownerUserId,
      source: 'email_link',
      note: 'Owner placed this campaign on hold from email. Do not publish until owner approves later.',
    },
  }
  const { error } = await sb.from('cos_campaign_queue').update({ status: 'waiting_approval', metadata }).eq('id', campaign.id)
  if (error) return html('Hold failed', `<h1 style="margin-top:0">Hold failed</h1><p>${error.message}</p>`, 500)
  return html('On hold', `<h1 style="margin-top:0;color:#ffc300">Campaign placed on hold</h1><p>COSA will not publish this campaign. You can return to the dashboard later and approve or edit it.</p><p><a href="${dashboardLink(req)}" style="color:#1af0ff">Open COSA video pipeline</a></p>`)
}

function changesForm(req: NextRequest, p: ReturnType<typeof actionParams>, campaign: any) {
  return html('Request edits', `<h1 style="margin-top:0">Request edits</h1><p><strong>${clean(campaign.title, 200)}</strong></p><p>Tell COSA what to change. The campaign will stay in waiting approval and will not publish.</p><form method="post" action="${req.nextUrl.pathname}?id=${encodeURIComponent(p.id)}&action=changes&owner=${encodeURIComponent(p.owner)}&email=${encodeURIComponent(p.email)}&token=${encodeURIComponent(p.token)}"><textarea name="comments" required rows="8" style="width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#020617;color:#fff;padding:12px;font-size:16px" placeholder="Example: Make the CTA stronger, use less generic footage, shorten the intro, change the narration tone..."></textarea><button type="submit" style="margin-top:12px;border:0;border-radius:12px;background:#1af0ff;color:#020617;font-weight:900;padding:12px 16px">Send edit request</button></form>`)
}

async function saveChanges(req: NextRequest, sb: ReturnType<typeof admin>, campaign: any, p: ReturnType<typeof actionParams>, comments: string) {
  const now = new Date().toISOString()
  const prior = Array.isArray(campaign.metadata?.editRequests) ? campaign.metadata.editRequests : []
  const metadata = {
    ...(campaign.metadata || {}),
    emailApproval: {
      state: 'changes_requested',
      requestedAt: now,
      ownerEmail: p.email,
      ownerUserId: p.owner,
      source: 'email_link',
    },
    editRequests: [
      ...prior,
      { at: now, source: 'email_link', ownerEmail: p.email, comments },
    ],
  }
  const { error } = await sb.from('cos_campaign_queue').update({ status: 'waiting_approval', metadata }).eq('id', campaign.id)
  if (error) return html('Edit request failed', `<h1 style="margin-top:0">Edit request failed</h1><p>${error.message}</p>`, 500)
  return html('Edit request sent', `<h1 style="margin-top:0;color:#1af0ff">Edit request saved</h1><p>Your comments were added to the campaign record. COSA should treat this campaign as not approved and pending edits.</p><p><strong>Comments:</strong> ${comments}</p><p><a href="${dashboardLink(req)}" style="color:#1af0ff">Open COSA video pipeline</a></p>`)
}

export async function GET(req: NextRequest) {
  const p = actionParams(req)
  if (!p.id || !p.owner || !p.email || !p.token) return html('Invalid link', '<h1 style="margin-top:0">Invalid approval link</h1><p>The email approval link is missing required fields.</p>', 400)
  if (!validToken(p.token, p.id, p.owner, p.email)) return html('Invalid token', '<h1 style="margin-top:0">Invalid or expired approval link</h1><p>Open the dashboard and request a fresh approval email.</p>', 403)

  const sb = admin()
  const loaded = await loadCampaign(sb, p.id)
  if (!loaded.ok) return html('Campaign not found', `<h1 style="margin-top:0">Campaign not found</h1><p>${loaded.error}</p>`, 404)

  if (p.action === 'approve') return approveCampaign(req, sb, loaded.campaign, p.owner, p.email)
  if (p.action === 'hold') return holdCampaign(req, sb, loaded.campaign, p.owner, p.email)
  return changesForm(req, p, loaded.campaign)
}

export async function POST(req: NextRequest) {
  const p = actionParams(req)
  if (!p.id || !p.owner || !p.email || !p.token) return html('Invalid link', '<h1 style="margin-top:0">Invalid approval link</h1><p>The email approval link is missing required fields.</p>', 400)
  if (!validToken(p.token, p.id, p.owner, p.email)) return html('Invalid token', '<h1 style="margin-top:0">Invalid or expired approval link</h1><p>Open the dashboard and request a fresh approval email.</p>', 403)

  const form = await req.formData().catch(() => null)
  const comments = clean(form?.get('comments') || '', 1600)
  if (!comments) return html('Comments required', '<h1 style="margin-top:0">Comments required</h1><p>Please enter the changes you want COSA to make.</p>', 400)

  const sb = admin()
  const loaded = await loadCampaign(sb, p.id)
  if (!loaded.ok) return html('Campaign not found', `<h1 style="margin-top:0">Campaign not found</h1><p>${loaded.error}</p>`, 404)
  return saveChanges(req, sb, loaded.campaign, p, comments)
}
