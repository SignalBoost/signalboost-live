// saas/app/api/cron/cos-auto-publish-exact/route.ts
// Retry owner-approved COSA video publication through the shared governed engine.
// Email is handled only after a provider-confirmed live URL exists.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import { GET as notifyPublishedLocations } from '@/app/api/cos/video-approval-notify/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VIDEO_CHANNELS = ['youtube', 'short_video']
const PLATFORM = 'youtube_channels'
const LIMIT = 5
const RETRY_MINUTES = 10
const QUOTA_RETRY_MINUTES = 24 * 60

type PublishAttemptResult = {
  ok: boolean
  language: string | null
  error?: string
  quotaBlockedUntil?: string | null
  videoUrl?: string
  liveUrl?: string
}

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

async function publicationEmailSummary(req: NextRequest) {
  try {
    const res = await notifyPublishedLocations(req)
    return await res.json().catch(() => ({ ok: false, error: 'publication notification response was not json' }))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'publication notification failed' }
  }
}

function minutesSince(value: unknown): number {
  const timestamp = value ? Date.parse(String(value)) : 0
  if (!timestamp) return Number.MAX_SAFE_INTEGER
  return Math.round((Date.now() - timestamp) / 60_000)
}

function firstLanguage(campaign: any): string {
  const languages = Array.isArray(campaign?.languages)
    ? campaign.languages.map(String).filter(Boolean)
    : []
  if (languages.length) return languages[0]

  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const found = items.find((item: any) => item?.input?.language)
  return found?.input?.language ? String(found.input.language) : ''
}

function exactFinalVideo(campaign: any, language: string): string | null {
  const video = campaign?.metadata?.video || {}
  const voiced = video.voiced && typeof video.voiced === 'object' ? video.voiced : {}
  const brandedLanguages = video.brandedLangs && typeof video.brandedLangs === 'object'
    ? video.brandedLangs
    : {}

  if (language && brandedLanguages[language] && voiced[language]) {
    return String(voiced[language])
  }

  const languageSpecificVideos = Object.keys(voiced).filter(key => Boolean(voiced[key]))
  if (
    language &&
    language === firstLanguage(campaign) &&
    languageSpecificVideos.length === 0 &&
    video.branded === true &&
    video.voicedUrl
  ) {
    return String(video.voicedUrl)
  }

  return null
}

function alreadyPublished(campaign: any, language: string): boolean {
  const published = campaign?.metadata?.published
  if (!published || typeof published !== 'object') return false
  return Boolean(published[`${PLATFORM}::${language}`] || published[PLATFORM])
}

function finalReady(campaign: any): boolean {
  const video = campaign?.metadata?.video || {}
  return video.status === 'ready' && video.branded === true && Boolean(video.voicedUrl)
}

function ownerEmail(campaign: any): string | null {
  const value = campaign?.metadata?.autoPublishArm?.email
    || campaign?.metadata?.approvalNotification?.email
    || campaign?.metadata?.video?.approvalNotification?.email
    || String((process.env.OWNER_EMAILS || '').split(',')[0] || '')
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

function quotaBlockedUntil(campaign: any): string | null {
  const metadata = campaign?.metadata || {}
  const values = [
    metadata?.youtubeQuota?.blockedUntil,
    metadata?.autoPublishExact?.quotaBlockedUntil,
    metadata?.autoPublishReady?.quotaBlockedUntil,
    metadata?.autoPublish?.quotaBlockedUntil,
  ]
    .filter(Boolean)
    .map(String)
    .filter(value => Date.parse(value) > Date.now())
    .sort()
  return values[0] || null
}

function quotaRetryWindowActive(campaign: any): boolean {
  if (quotaBlockedUntil(campaign)) return true
  const lastQuota = campaign?.metadata?.autoPublishExact?.lastQuotaErrorAt
    || campaign?.metadata?.youtubeQuota?.blockedAt
  return minutesSince(lastQuota) < QUOTA_RETRY_MINUTES
}

function eligible(campaign: any): boolean {
  if (!VIDEO_CHANNELS.includes(String(campaign?.channel || ''))) return false
  if (String(campaign?.status || '') !== 'approved') return false
  if (!campaign?.approved_at || !campaign?.approved_by) return false
  if (!finalReady(campaign)) return false

  const language = firstLanguage(campaign)
  if (!language) return false
  if (alreadyPublished(campaign, language)) return false
  if (!exactFinalVideo(campaign, language)) return false
  if (quotaRetryWindowActive(campaign)) return false

  return minutesSince(campaign?.metadata?.autoPublishExact?.lastAttemptAt) >= RETRY_MINUTES
}

async function recordFailure(sb: any, campaign: any, error: string, quotaBlocked: string | null) {
  const now = new Date().toISOString()
  const metadata = campaign?.metadata || {}
  await sb.from('cos_campaign_queue').update({
    status: 'approved',
    metadata: {
      ...metadata,
      autoPublishExact: {
        ...(metadata.autoPublishExact || {}),
        lastAttemptAt: now,
        ...(quotaBlocked ? { lastQuotaErrorAt: now, quotaBlockedUntil: quotaBlocked } : {}),
        ok: false,
        error,
        language: firstLanguage(campaign) || null,
      },
    },
  }).eq('id', campaign.id)
}

async function publishOne(sb: any, campaign: any): Promise<PublishAttemptResult> {
  const language = firstLanguage(campaign)
  const videoUrl = exactFinalVideo(campaign, language)
  if (!videoUrl) {
    return { ok: false, language: language || null, error: `No exact final video for ${language || 'unknown language'}` }
  }

  const result = await publishCampaignCore({
    admin: sb,
    userId: String(campaign.approved_by),
    userEmail: ownerEmail(campaign),
    id: campaign.id,
    language,
    videoUrl,
  })

  if (!result.ok) {
    const error = result.error || 'Publish failed'
    const quota = result.status === 429 || error.toLowerCase().includes('quota')
    const quotaBlocked = quota
      ? new Date(Date.now() + QUOTA_RETRY_MINUTES * 60_000).toISOString()
      : null
    await recordFailure(sb, campaign, error, quotaBlocked)
    return { ok: false, language, error, quotaBlockedUntil: quotaBlocked }
  }

  const liveUrl = String(result.result?.liveUrl || '').trim()
  if (!liveUrl) {
    const error = 'Provider did not return a confirmed live publication URL.'
    await recordFailure(sb, campaign, error, null)
    return { ok: false, language, error }
  }

  const now = new Date().toISOString()
  const { data: freshRow } = await sb
    .from('cos_campaign_queue')
    .select('metadata')
    .eq('id', campaign.id)
    .single()
  const freshMetadata = freshRow?.metadata || campaign.metadata || {}

  await sb.from('cos_campaign_queue').update({
    metadata: {
      ...freshMetadata,
      autoPublishExact: {
        ...(freshMetadata.autoPublishExact || {}),
        lastAttemptAt: now,
        ok: true,
        error: null,
        language,
        videoUrl,
        liveUrl,
      },
    },
  }).eq('id', campaign.id)

  return { ok: true, language, videoUrl, liveUrl }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization') || ''
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sb = admin()
  const { data, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .eq('status', 'approved')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const activeQuotaBlock = (data || [])
    .map(quotaBlockedUntil)
    .filter((value): value is string => Boolean(value))
    .sort()[0] || null

  if (activeQuotaBlock) {
    const publicationEmail = await publicationEmailSummary(req)
    return NextResponse.json({
      ok: true,
      scanned: data?.length || 0,
      eligible: 0,
      published: 0,
      quotaBlockedUntil: activeQuotaBlock,
      results: [],
      publicationEmail,
    })
  }

  const targets = (data || []).filter(eligible).slice(0, LIMIT)
  const results: Array<PublishAttemptResult & { campaign: string; title: string }> = []
  for (const campaign of targets) {
    const result = await publishOne(sb, campaign)
    results.push({ campaign: String(campaign.id), title: String(campaign.title || ''), ...result })
    if (!result.ok && result.quotaBlockedUntil) break
  }

  // This endpoint sends only stored, provider-confirmed publication locations.
  // It never sends approval, progress, quota, or failure messages.
  const publicationEmail = await publicationEmailSummary(req)

  return NextResponse.json({
    ok: true,
    scanned: data?.length || 0,
    eligible: targets.length,
    published: results.filter(result => result.ok).length,
    results,
    publicationEmail,
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
