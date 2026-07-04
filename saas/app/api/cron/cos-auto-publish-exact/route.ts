// saas/app/api/cron/cos-auto-publish-exact/route.ts
// Exact-campaign automatic publishing for final branded COSA videos.
// Also sends owner approval emails for final-ready videos before publishing.
//
// Production safety: this cron no longer calls the platform connector directly.
// It routes through publishCampaignCore so quota/circuit-breaker gates are shared
// with manual publish and email approval publish paths.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import { sendEmail } from '@/lib/email'
import { GET as notifyFinalVideoApprovals } from '@/app/api/cos/video-approval-notify/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VIDEO_CHANNELS = ['youtube', 'short_video']
const PLATFORM = 'youtube_channels'
const LIMIT = 5
const RETRY_MINUTES = 20
const QUOTA_RETRY_MINUTES = 24 * 60

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

async function approvalEmailSummary(req: NextRequest) {
  try {
    const res = await notifyFinalVideoApprovals(req)
    return await res.json().catch(() => ({ ok: false, error: 'approval notification response was not json' }))
  } catch (e: any) {
    return { ok: false, error: e?.message || 'approval notification failed' }
  }
}

function minutesSince(value: any): number {
  const t = value ? Date.parse(String(value)) : 0
  if (!t) return 999999
  return Math.round((Date.now() - t) / 60000)
}

function firstLanguage(campaign: any): string {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.map(String).filter(Boolean) : []
  if (langs.length) return langs[0]
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const found = items.find((it: any) => it?.input?.language)
  return found?.input?.language ? String(found.input.language) : ''
}

function exactFinalVideo(campaign: any, lang: string): string | null {
  const video = campaign?.metadata?.video || {}
  const voiced = video.voiced && typeof video.voiced === 'object' ? video.voiced : {}
  const brandedLangs = video.brandedLangs && typeof video.brandedLangs === 'object' ? video.brandedLangs : {}
  if (lang && brandedLangs[lang] && voiced[lang]) return String(voiced[lang])
  const knownLangs = Array.from(new Set([
    ...(Array.isArray(campaign.languages) ? campaign.languages.map(String) : []),
    ...Object.keys(brandedLangs),
    ...Object.keys(voiced),
  ].filter(Boolean)))
  if (knownLangs.length <= 1 && video.branded === true && video.voicedUrl) return String(video.voicedUrl)
  return null
}

function alreadyPublished(campaign: any, lang: string): boolean {
  const published = campaign?.metadata?.published || {}
  if (!published || typeof published !== 'object') return false
  return Boolean(published[`${PLATFORM}::${lang}`] || published[PLATFORM])
}

function finalReady(campaign: any): boolean {
  const video = campaign?.metadata?.video || {}
  return video.status === 'ready' && video.branded === true && Boolean(video.voicedUrl)
}

function quotaBlockedUntil(campaign: any): string | null {
  const meta = campaign?.metadata || {}
  const candidates = [
    meta?.youtubeQuota?.blockedUntil,
    meta?.autoPublishExact?.quotaBlockedUntil,
    meta?.autoPublishReady?.quotaBlockedUntil,
    meta?.autoPublish?.quotaBlockedUntil,
  ].filter(Boolean)
  const future = candidates
    .map((v: any) => String(v))
    .filter((v: string) => Date.parse(v) > Date.now())
    .sort()
  return future[0] || null
}

function quotaRetryWindowActive(campaign: any): boolean {
  const quotaUntil = quotaBlockedUntil(campaign)
  if (quotaUntil) return true
  const lastQuota = campaign?.metadata?.autoPublishExact?.lastQuotaErrorAt || campaign?.metadata?.youtubeQuota?.blockedAt
  return minutesSince(lastQuota) < QUOTA_RETRY_MINUTES
}

function eligible(campaign: any): boolean {
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (String(campaign.status) !== 'approved') return false
  if (!campaign.approved_at || !campaign.approved_by) return false
  if (!finalReady(campaign)) return false
  const lang = firstLanguage(campaign)
  if (!lang) return false
  if (alreadyPublished(campaign, lang)) return false
  if (!exactFinalVideo(campaign, lang)) return false
  if (quotaRetryWindowActive(campaign)) return false
  const last = campaign?.metadata?.autoPublishExact?.lastAttemptAt
  if (minutesSince(last) < RETRY_MINUTES) return false
  return true
}

async function publishOne(sb: any, campaign: any) {
  const lang = firstLanguage(campaign)
  const videoUrl = exactFinalVideo(campaign, lang)
  if (!videoUrl) return { ok: false, error: `No exact final video for ${lang || 'unknown language'}`, language: lang || null }

  const res = await publishCampaignCore({
    admin: sb,
    userId: String(campaign.approved_by),
    userEmail: campaign?.metadata?.autoPublishArm?.email || campaign?.metadata?.approvalNotification?.email || campaign?.metadata?.video?.approvalNotification?.email || null,
    id: campaign.id,
    language: lang,
    videoUrl,
  })

  const now = new Date().toISOString()
  const { data: freshRow } = await sb.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
  const freshMeta = freshRow?.metadata || campaign.metadata || {}

  if (!res.ok) {
    const quota = res.status === 429 || String(res.error || '').toLowerCase().includes('quota')
    const quotaBlocked = quota ? new Date(Date.now() + QUOTA_RETRY_MINUTES * 60000).toISOString() : null
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...freshMeta,
        autoPublishExact: {
          lastAttemptAt: now,
          ...(quota ? { lastQuotaErrorAt: now, quotaBlockedUntil: quotaBlocked } : {}),
          ok: false,
          error: res.error,
          language: lang || null,
        },
      },
    }).eq('id', campaign.id)
    return { ok: false, error: res.error || 'Publish failed', language: lang, quotaBlockedUntil: quotaBlocked }
  }

  const liveUrl = res.result?.liveUrl || null
  await sb.from('cos_campaign_queue').update({
    metadata: {
      ...freshMeta,
      autoPublishExact: {
        lastAttemptAt: now,
        ok: true,
        language: lang,
        videoUrl,
        liveUrl,
      },
    },
  }).eq('id', campaign.id)

  const email = campaign?.metadata?.autoPublishArm?.email || campaign?.metadata?.approvalNotification?.email || campaign?.metadata?.video?.approvalNotification?.email
  if (liveUrl && email) {
    await sendEmail({
      from: 'saasMarketing',
      to: email,
      subject: `Your SignalBoostAi video is live: ${campaign.title || 'approved video'}`,
      html: `<p>Your approved video is live.</p><p><a href="${liveUrl}">${liveUrl}</a></p>`,
    })
  }

  return { ok: true, language: lang, videoUrl, liveUrl }
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const approvalEmail = await approvalEmailSummary(req)
  const sb = admin()
  const { data, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .eq('status', 'approved')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ ok: false, error: error.message, approvalEmail }, { status: 500 })

  const activeQuotaBlock = (data || []).map(quotaBlockedUntil).filter(Boolean).sort()[0] || null
  if (activeQuotaBlock) {
    return NextResponse.json({
      ok: true,
      approvalEmail,
      scanned: data?.length || 0,
      eligible: 0,
      published: 0,
      quotaBlockedUntil: activeQuotaBlock,
      results: [{ ok: false, status: 'blocked', error: `YouTube upload quota is paused until ${activeQuotaBlock}` }],
    })
  }

  const targets = (data || []).filter(eligible).slice(0, LIMIT)
  const results: any[] = []
  for (const campaign of targets) {
    const res = await publishOne(sb, campaign)
    results.push({ campaign: campaign.id, title: campaign.title, ...res })
    if (!res.ok && res.quotaBlockedUntil) break
  }

  return NextResponse.json({ ok: true, approvalEmail, scanned: data?.length || 0, eligible: targets.length, published: results.filter(r => r.ok).length, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
