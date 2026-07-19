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
const RETRY_MINUTES = 10
const QUOTA_RETRY_MINUTES = 24 * 60

type FailureEmailResult = {
  notified: boolean
  attempted: boolean
  error: string | null
  email: string | null
  attemptedAt: string | null
}

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

  // `voicedUrl` is the canonical primary-language final produced by the legacy and
  // single-language pipelines. Campaigns may still list several requested languages
  // before per-language renders exist, so counting campaign.languages here incorrectly
  // made the primary final ineligible forever. Use the default final only for the
  // campaign's first language and only when no language-specific voiced render exists.
  const specificVoiced = Object.keys(voiced).filter(key => Boolean(voiced[key]))
  if (
    lang &&
    lang === firstLanguage(campaign) &&
    specificVoiced.length === 0 &&
    video.branded === true &&
    video.voicedUrl
  ) return String(video.voicedUrl)

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

function configuredOwnerEmail(): string | null {
  const value = String((process.env.OWNER_EMAILS || '').split(',')[0] || '').trim().toLowerCase()
  return value || null
}

function campaignOwnerEmail(campaign: any): string | null {
  const value = campaign?.metadata?.autoPublishArm?.email
    || campaign?.metadata?.approvalNotification?.email
    || campaign?.metadata?.video?.approvalNotification?.email
    || configuredOwnerEmail()
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
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

async function sendFailureEmailOnce(args: {
  campaign: any
  metadata: any
  error: string
  quotaBlockedUntil?: string | null
}): Promise<FailureEmailResult> {
  const { campaign, metadata, error, quotaBlockedUntil: blockedUntil = null } = args
  const email = campaignOwnerEmail(campaign)
  const previous = metadata?.autoPublishExact?.failureNotification || {}
  const sameFailureAlreadySent = previous?.ok === true
    && String(previous?.error || '') === error
    && String(previous?.quotaBlockedUntil || '') === String(blockedUntil || '')

  if (!email || sameFailureAlreadySent) {
    return {
      notified: sameFailureAlreadySent,
      attempted: false,
      error: email ? null : 'Owner email is not configured.',
      email,
      attemptedAt: null,
    }
  }

  const sent = await sendEmail({
    from: 'saasMarketing',
    to: email,
    subject: `COSA could not publish your approved video: ${String(campaign.title || 'approved video').slice(0, 90)}`,
    html: `
      <p>Your video is approved, but COSA could not publish it yet.</p>
      <p><strong>${String(campaign.title || 'Approved video')}</strong></p>
      <p>${error}</p>
      ${blockedUntil ? `<p>Automatic retry is paused until ${blockedUntil}.</p>` : '<p>COSA will retry automatically.</p>'}
      <p>No duplicate video will be created, and no live-link email will be sent until the provider confirms a real published URL.</p>
    `.trim(),
  })

  return {
    notified: Boolean(sent?.ok),
    attempted: true,
    error: sent?.ok ? null : sent?.error || 'send failed',
    email,
    attemptedAt: new Date().toISOString(),
  }
}

async function publishOne(sb: any, campaign: any) {
  const lang = firstLanguage(campaign)
  const videoUrl = exactFinalVideo(campaign, lang)
  if (!videoUrl) return { ok: false, error: `No exact final video for ${lang || 'unknown language'}`, language: lang || null }

  const ownerEmail = campaignOwnerEmail(campaign)
  const res = await publishCampaignCore({
    admin: sb,
    userId: String(campaign.approved_by),
    userEmail: ownerEmail,
    id: campaign.id,
    language: lang,
    videoUrl,
  })

  const now = new Date().toISOString()
  const { data: freshRow } = await sb.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
  const freshMeta = freshRow?.metadata || campaign.metadata || {}

  if (!res.ok) {
    const errorText = res.error || 'Publish failed'
    const quota = res.status === 429 || String(errorText).toLowerCase().includes('quota')
    const quotaBlocked = quota ? new Date(Date.now() + QUOTA_RETRY_MINUTES * 60000).toISOString() : null
    const failureNotification = await sendFailureEmailOnce({
      campaign,
      metadata: freshMeta,
      error: errorText,
      quotaBlockedUntil: quotaBlocked,
    })

    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...freshMeta,
        autoPublishExact: {
          ...(freshMeta?.autoPublishExact || {}),
          lastAttemptAt: now,
          ...(quota ? { lastQuotaErrorAt: now, quotaBlockedUntil: quotaBlocked } : {}),
          ok: false,
          error: errorText,
          language: lang || null,
          failureNotification: {
            ok: failureNotification.notified,
            attempted: failureNotification.attempted,
            error: errorText,
            deliveryError: failureNotification.error,
            quotaBlockedUntil: quotaBlocked,
            attemptedAt: failureNotification.attemptedAt || now,
            email: failureNotification.email || ownerEmail,
          },
        },
      },
    }).eq('id', campaign.id)
    return { ok: false, error: errorText, language: lang, quotaBlockedUntil: quotaBlocked, failureEmailSent: failureNotification.notified }
  }

  const liveUrl = res.result?.liveUrl || null
  await sb.from('cos_campaign_queue').update({
    metadata: {
      ...freshMeta,
      autoPublishExact: {
        ...(freshMeta?.autoPublishExact || {}),
        lastAttemptAt: now,
        ok: true,
        error: null,
        language: lang,
        videoUrl,
        liveUrl,
        failureNotification: null,
      },
    },
  }).eq('id', campaign.id)

  // publishCampaignCore already sends and records the live-link email. Do not send
  // a second message here; the notification route retries only failed deliveries.
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

  const blockedCampaigns = (data || []).filter(campaign => Boolean(quotaBlockedUntil(campaign)))
  const activeQuotaBlock = blockedCampaigns.map(quotaBlockedUntil).filter(Boolean).sort()[0] || null
  if (activeQuotaBlock) {
    const notifications: any[] = []
    for (const campaign of blockedCampaigns.slice(0, LIMIT)) {
      const blockedUntil = quotaBlockedUntil(campaign)
      const errorText = `YouTube upload quota is paused until ${blockedUntil}`
      const notification = await sendFailureEmailOnce({
        campaign,
        metadata: campaign.metadata || {},
        error: errorText,
        quotaBlockedUntil: blockedUntil,
      })
      if (notification.attempted) {
        const meta = campaign.metadata || {}
        await sb.from('cos_campaign_queue').update({
          metadata: {
            ...meta,
            autoPublishExact: {
              ...(meta.autoPublishExact || {}),
              failureNotification: {
                ok: notification.notified,
                attempted: notification.attempted,
                error: errorText,
                deliveryError: notification.error,
                quotaBlockedUntil: blockedUntil,
                attemptedAt: notification.attemptedAt || new Date().toISOString(),
                email: notification.email || campaignOwnerEmail(campaign),
              },
            },
          },
        }).eq('id', campaign.id)
      }
      notifications.push({ campaign: campaign.id, notified: notification.notified, error: notification.error })
    }

    return NextResponse.json({
      ok: true,
      approvalEmail,
      scanned: data?.length || 0,
      eligible: 0,
      published: 0,
      quotaBlockedUntil: activeQuotaBlock,
      failureNotifications: notifications,
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
