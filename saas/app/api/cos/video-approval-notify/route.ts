// saas/app/api/cos/video-approval-notify/route.ts
// Notify the owner only when the FINAL COSA video is ready for approval.
// Raw/base renders are not campaign-ready and must not trigger approval requests.
//
// The email includes direct secure actions so the owner can approve, hold, or
// request edits from a phone without needing to sit at the dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { getAccess } from '@/lib/auth/access'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const LIMIT = 10

type OwnerResolveResult =
  | { ok: true; email: string; userId: string; source: 'session' | 'cron' }
  | { ok: false; error: string }

type ListedUser = { id?: string; email?: string | null }

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function actionSecret() {
  return process.env.COS_EMAIL_APPROVAL_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-secret'
}

function actionToken(campaignId: string, ownerUserId: string, ownerEmail: string) {
  return createHmac('sha256', actionSecret())
    .update(`${campaignId}:${ownerUserId}:${ownerEmail}`)
    .digest('hex')
}

function finalVideoUrl(video: any): string | null {
  if (!video) return null
  if (video.status !== 'ready') return null
  if (video.branded !== true) return null
  if (!video.voicedUrl) return null
  return String(video.voicedUrl)
}

function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  return Boolean(secret && auth === `Bearer ${secret}`)
}

async function resolveOwner(req: NextRequest, sb: ReturnType<typeof admin>): Promise<OwnerResolveResult> {
  const ctx = await getAccess()
  if (ctx.isOwner && ctx.email && ctx.userId) return { ok: true, email: ctx.email, userId: ctx.userId, source: 'session' }

  if (!isCronRequest(req)) return { ok: false, error: 'Owner only.' }

  const ownerEmail = String((process.env.OWNER_EMAILS || '').split(',')[0] || '').trim().toLowerCase()
  if (!ownerEmail) return { ok: false, error: 'OWNER_EMAILS is not configured.' }

  try {
    const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const users = ((listed as any)?.data?.users || []) as ListedUser[]
    const owner = users.find((user: ListedUser) => String(user.email || '').toLowerCase() === ownerEmail)
    if (!owner?.id) return { ok: false, error: `Owner user not found for ${ownerEmail}.` }
    return { ok: true, email: ownerEmail, userId: owner.id, source: 'cron' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not resolve owner user.' }
  }
}

function baseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
}

function approvalPage(req: NextRequest) {
  return `${baseUrl(req)}/dashboard/cosa/video-pipeline`
}

function actionLink(req: NextRequest, campaignId: string, ownerUserId: string, ownerEmail: string, action: 'approve' | 'hold' | 'changes') {
  const params = new URLSearchParams({
    id: campaignId,
    action,
    owner: ownerUserId,
    email: ownerEmail,
    token: actionToken(campaignId, ownerUserId, ownerEmail),
  })
  return `${baseUrl(req)}/api/cos/campaign-queue/email-action?${params.toString()}`
}

function buttonLink(url: string, label: string, background: string, color = '#020617') {
  return `<a href="${url}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 16px;border-radius:10px;background:${background};color:${color};font-weight:800;text-decoration:none">${label}</a>`
}

export async function GET(req: NextRequest) {
  const sb = admin()
  const owner = await resolveOwner(req, sb)
  if (!owner.ok) return NextResponse.json({ ok: false, error: owner.error }, { status: owner.error === 'Owner only.' ? 403 : 400 })

  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .in('status', ['waiting_approval', 'draft'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const toNotify = (campaigns || [])
    .filter((c: any) => {
      const video = c?.metadata?.video
      if (!finalVideoUrl(video)) return false
      if (video?.approvalRequestedAt) return false
      return true
    })
    .slice(0, LIMIT)

  const results: any[] = []

  for (const campaign of toNotify) {
    const video = campaign.metadata.video
    const title = String(campaign.title || 'COSA video campaign')
    const watch = finalVideoUrl(video)
    const approve = actionLink(req, campaign.id, owner.userId, owner.email, 'approve')
    const hold = actionLink(req, campaign.id, owner.userId, owner.email, 'hold')
    const changes = actionLink(req, campaign.id, owner.userId, owner.email, 'changes')
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: owner.email,
      subject: `Final video ready for approval: ${title.slice(0, 90)}`,
      html: `
        <p>COSA has prepared the final branded video for your review.</p>
        <p><strong>${title}</strong></p>
        <p>This final version should include voice/captions plus the SignalBoostAi and www.saas.signalboostapp.com branding.</p>
        <p><a href="${watch}">Watch the preview video</a></p>
        <p>${buttonLink(approve, 'Approve and publish', '#ffc300')}${buttonLink(hold, 'Hold / not yet', '#64748b', '#ffffff')}${buttonLink(changes, 'Request edits', '#1af0ff')}</p>
        <p><a href="${approvalPage(req)}">Open the COSA video approval dashboard</a></p>
        <p>Approval is still governed. If you approve, COSA will publish automatically, track performance, and email the live link.</p>
      `.trim(),
    })

    const patchVideo = {
      ...video,
      approvalRequestedAt: new Date().toISOString(),
      approvalNotification: {
        ok: Boolean(sent?.ok),
        email: owner.email,
        ownerUserId: owner.userId,
        source: owner.source,
        finalOnly: true,
        emailActions: true,
        error: sent?.ok ? null : sent?.error || 'send failed',
      },
    }

    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: patchVideo },
    }).eq('id', campaign.id)

    results.push({ campaign: campaign.id, title, notified: Boolean(sent?.ok), finalVideo: true, emailActions: true, error: sent?.ok ? null : sent?.error || 'send failed' })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, notified: results.length, results, approvalPage: approvalPage(req), rule: 'final branded videos only', ownerSource: owner.source })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
