// saas/app/api/cron/cos-auto-publish-ready/route.ts
// Completes the intended one-approval workflow:
// owner approves once -> COSA waits until the branded video is ready -> publish automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autoPublishApprovedCampaign } from '@/lib/cos/campaign-queue/publish-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VIDEO_CHANNELS = ['youtube', 'short_video']
const LIMIT = 10
const MIN_RETRY_MINUTES = 30

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

function readyForAutoPublish(campaign: any): boolean {
  const meta = campaign.metadata || {}
  const video = meta.video || {}
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (!campaign.approved_at || !campaign.approved_by) return false
  if (!['approved', 'queued', 'running'].includes(String(campaign.status))) return false
  if (alreadyPublished(meta)) return false
  if (video.status !== 'ready') return false
  if (video.branded !== true) return false
  if (!video.voicedUrl) return false

  const lastAttemptAt = meta?.autoPublishReady?.lastAttemptAt || meta?.autoPublish?.ranAt
  if (minutesSince(lastAttemptAt) < MIN_RETRY_MINUTES) return false
  return true
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .in('status', ['approved', 'queued', 'running'])
    .not('approved_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const targets = (campaigns || []).filter(readyForAutoPublish).slice(0, LIMIT)
  const results: any[] = []
  let published = 0

  for (const campaign of targets) {
    const userId = String(campaign.approved_by || '')
    const userEmail = campaign.metadata?.video?.approvalNotification?.email || campaign.metadata?.approvalNotification?.email || null
    const res = await autoPublishApprovedCampaign({ admin: sb, userId, userEmail, campaignId: campaign.id })
    if (res.published > 0) published += res.published

    const { data: freshRow } = await sb.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
    const freshMeta = freshRow?.metadata || campaign.metadata || {}
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...freshMeta,
        autoPublishReady: {
          lastAttemptAt: new Date().toISOString(),
          attempted: res.attempted,
          published: res.published,
          results: res.results,
        },
      },
    }).eq('id', campaign.id)

    results.push({ campaign: campaign.id, title: campaign.title, attempted: res.attempted, published: res.published, results: res.results })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, eligible: targets.length, published, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
