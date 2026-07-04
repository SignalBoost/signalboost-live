// saas/app/api/cron/cos-auto-publish-ready/route.ts
// Completes the intended one-approval workflow:
// owner approves once -> COSA waits until the branded video is ready -> publish automatically.
//
// Some approved rows can show status='approved' before approved_at/approved_by are
// stamped. This cron treats status='approved' as the owner approval intent, repairs
// the missing stamp with the configured owner account, then publishes automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autoPublishApprovedCampaign } from '@/lib/cos/campaign-queue/publish-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VIDEO_CHANNELS = ['youtube', 'short_video']
const LIMIT = 10
const MIN_RETRY_MINUTES = 30

type OwnerAccount = { id: string; email: string } | null

function db() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function minutesSince(value: unknown): number {
  const t = value ? Date.parse(String(value)) : 0
  if (!t) return 999999
  return Math.round((Date.now() - t) / 60000)
}

function alreadyPublished(meta: any): boolean {
  const published = meta?.published
  if (!published || typeof published !== 'object') return false
  return Object.keys(published).length > 0
}

function finalBrandedVideoReady(campaign: any): boolean {
  const video = campaign?.metadata?.video || {}
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (video.status !== 'ready') return false
  if (video.branded !== true) return false
  if (!video.voicedUrl) return false
  return true
}

function readyForAutoPublish(campaign: any): boolean {
  const meta = campaign.metadata || {}
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (!['approved', 'queued', 'running'].includes(String(campaign.status))) return false
  if (alreadyPublished(meta)) return false
  if (!finalBrandedVideoReady(campaign)) return false

  // Normal path: approved_at + approved_by are already stamped.
  // Recovery path: status='approved' means the owner already approved in UI, so
  // the cron may repair missing stamp fields before invoking publish-core.
  const hasApprovalStamp = Boolean(campaign.approved_at) && Boolean(campaign.approved_by)
  if (!hasApprovalStamp && String(campaign.status) !== 'approved') return false

  const lastAttemptAt = meta?.autoPublishReady?.lastAttemptAt || meta?.autoPublish?.ranAt
  if (minutesSince(lastAttemptAt) < MIN_RETRY_MINUTES) return false
  return true
}

async function resolveOwnerAccount(sb: any): Promise<OwnerAccount> {
  const ownerEmail = String((process.env.OWNER_EMAILS || '').split(',')[0] || '').trim().toLowerCase()
  if (!ownerEmail) return null
  try {
    const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const users = ((listed as any)?.data?.users || []) as Array<{ id?: string; email?: string | null }>
    const owner = users.find((user) => String(user.email || '').toLowerCase() === ownerEmail)
    if (!owner?.id) return null
    return { id: owner.id, email: ownerEmail }
  } catch {
    return null
  }
}

async function ensureApprovalStamp(sb: any, campaign: any, owner: OwnerAccount): Promise<{ ok: boolean; userId: string; userEmail: string | null; recovered: boolean; error?: string }> {
  if (campaign.approved_at && campaign.approved_by) {
    return {
      ok: true,
      userId: String(campaign.approved_by),
      userEmail: campaign.metadata?.video?.approvalNotification?.email || campaign.metadata?.approvalNotification?.email || owner?.email || null,
      recovered: false,
    }
  }

  if (String(campaign.status) !== 'approved') {
    return { ok: false, userId: '', userEmail: null, recovered: false, error: 'Campaign is missing approval stamp and is not status=approved.' }
  }

  if (!owner?.id) {
    return { ok: false, userId: '', userEmail: null, recovered: false, error: 'Campaign is approved but approved_by is missing, and OWNER_EMAILS could not be resolved.' }
  }

  const approvedAt = campaign.approved_at || new Date().toISOString()
  const freshMeta = campaign.metadata || {}
  const { error } = await sb.from('cos_campaign_queue').update({
    approved_at: approvedAt,
    approved_by: owner.id,
    metadata: {
      ...freshMeta,
      autoPublishApprovalRecovery: {
        at: new Date().toISOString(),
        reason: 'status was approved but approved_at/approved_by were missing; cron repaired stamp before auto-publish',
        ownerEmail: owner.email,
      },
    },
  }).eq('id', campaign.id)

  if (error) return { ok: false, userId: '', userEmail: null, recovered: false, error: error.message }
  return { ok: true, userId: owner.id, userEmail: owner.email, recovered: true }
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const owner = await resolveOwnerAccount(sb)
  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .in('status', ['approved', 'queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const targets = (campaigns || []).filter(readyForAutoPublish).slice(0, LIMIT)
  const results: any[] = []
  let published = 0
  let recoveredApprovals = 0

  for (const campaign of targets) {
    const stamp = await ensureApprovalStamp(sb, campaign, owner)
    if (!stamp.ok) {
      await sb.from('cos_campaign_queue').update({
        metadata: {
          ...(campaign.metadata || {}),
          autoPublishReady: {
            lastAttemptAt: new Date().toISOString(),
            attempted: 0,
            published: 0,
            error: stamp.error,
          },
        },
      }).eq('id', campaign.id)
      results.push({ campaign: campaign.id, title: campaign.title, attempted: 0, published: 0, error: stamp.error })
      continue
    }

    if (stamp.recovered) recoveredApprovals++
    const res = await autoPublishApprovedCampaign({ admin: sb, userId: stamp.userId, userEmail: stamp.userEmail, campaignId: campaign.id })
    if (res.published > 0) published += res.published

    const { data: freshRow } = await sb.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
    const freshMeta = freshRow?.metadata || campaign.metadata || {}
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...freshMeta,
        autoPublishReady: {
          lastAttemptAt: new Date().toISOString(),
          approvalStampRecovered: stamp.recovered,
          attempted: res.attempted,
          published: res.published,
          results: res.results,
        },
      },
    }).eq('id', campaign.id)

    results.push({ campaign: campaign.id, title: campaign.title, approvalStampRecovered: stamp.recovered, attempted: res.attempted, published: res.published, results: res.results })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, eligible: targets.length, recoveredApprovals, published, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
