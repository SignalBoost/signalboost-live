// saas/app/api/cron/cos-auto-publish/route.ts
// The last mile of "AI does everything; the human only starts and approves."
// Every few minutes: find OWNER-APPROVED campaigns whose video is READY and
// BRANDED, run the same autonomous quality gate as the manual publish route,
// publish to the platform using the APPROVER's connected account, and email the
// owner the live link. Humans never click Publish; the manual route remains as
// an override.
//
// Safety rails:
//   - BACKLOG_CUTOFF: never touches pre-July-2 backlog campaigns.
//   - Skips anything already published for the platform+primary-language key.
//   - approved_by must be a real uuid (the Approve button stamps it) — a
//     campaign without one is skipped with a visible note, never guessed at.
//   - All the manual route's gates apply: branded required (no override here;
//     unbranded NEVER auto-publishes), readiness score floor, valid token.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CHANNEL_TO_PLATFORM: Record<string, SocialPlatform | undefined> = {
  youtube: 'youtube_channels',
  short_video: 'tiktok',
  linkedin: 'linkedin_company',
}
const VIDEO_CHANNELS = ['youtube', 'short_video']

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function approverEmail(sb: any, userId: string): Promise<string | null> {
  try {
    const { data } = await sb.auth.admin.getUserById(userId)
    return data?.user?.email || null
  } catch {
    return null
  }
}

async function publishOne(sb: any, campaign: any): Promise<{ status: 'published' | 'skipped' | 'blocked' | 'failed'; note?: string }> {
  const platform = CHANNEL_TO_PLATFORM[String(campaign.channel)]
  if (!platform || !SOCIAL_CONNECTORS[platform]) return { status: 'skipped', note: 'channel has no direct platform' }

  const video = campaign.metadata?.video || {}
  const isVideo = VIDEO_CHANNELS.includes(String(campaign.channel))
  if (isVideo) {
    if (video.status !== 'ready') return { status: 'skipped', note: 'video not ready yet' }
    if (video.branded !== true || !video.voicedUrl) return { status: 'skipped', note: 'brand banner not burned in yet — auto-publish never ships without SignalBoostAi + www.saas.signalboostapp.com on the video' }
  }

  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en']
  const language = langs[0]
  const publishedKey = `${platform}::${language}`
  const published = (campaign.metadata && campaign.metadata.published) || {}
  if (published[publishedKey] || published[platform]) return { status: 'skipped', note: 'already published' }

  const approvedBy = String(campaign.approved_by || '')
  if (!UUID_RE.test(approvedBy)) {
    return { status: 'blocked', note: 'no approver uuid on record — approve via the dashboard so the publisher knows whose account to use' }
  }

  const readiness = scoreCampaignReadiness(campaign)
  const readinessOk = readiness.grade === 'improved' || readiness.grade === 'marketing_grade_ready'
  if (!readinessOk) {
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), readiness, auto_publish_note: `Blocked by readiness gate: ${readiness.score}/${readiness.max_score} (${readiness.grade}).` },
    }).eq('id', campaign.id)
    return { status: 'blocked', note: `readiness ${readiness.score}/${readiness.max_score}` }
  }

  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const matched = items.find((it: any) => it?.input?.language === language && it?.output) || items.find((it: any) => it?.output)
  const draftText = matched?.output?.draft ? String(matched.output.draft) : ''
  const draftTitle = matched?.output?.title ? String(matched.output.title) : ''
  let text = String(draftText || campaign.objective || campaign.title || '')
  const title = String(draftTitle || campaign.title || '')

  const brandedForLang = video.brandedLangs?.[language] ? video.voiced?.[language] : null
  const videoUrl = brandedForLang ? String(brandedForLang) : (video.voicedUrl ? String(video.voicedUrl) : undefined)
  if (isVideo && !videoUrl) return { status: 'skipped', note: 'branded video URL not ready yet — banner worker still running' }

  const trackingUrl = buildTrackingUrl(campaign.id, platform)
  if (!text.includes('/api/track?')) text = `${text}\n\n👉 ${trackingUrl}`.trim()

  const tok = await getValidSocialToken(sb, approvedBy, platform)
  if (!tok.ok || !tok.accessToken) {
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), auto_publish_note: `Blocked: no valid ${platform} token for approver (${tok.error || 'no token'}). Connect that platform once, then COSA will retry automatically on the next cron run.` },
    }).eq('id', campaign.id)
    return { status: 'blocked', note: tok.error || 'no valid token' }
  }

  let result: any
  try {
    result = await publishSocialPost({ platform, text, videoUrl, title, accessToken: tok.accessToken } as any)
  } catch (e: any) {
    return { status: 'failed', note: e?.message || 'publish threw' }
  }
  if (!result?.ok) return { status: 'failed', note: String(result?.mode || 'publish failed') }

  const publishedAt = new Date().toISOString()
  const isReallyLive = Boolean(result.liveUrl) && !String(result.mode || '').includes('not_configured')

  let notified = false
  let notifyError: string | undefined
  const email = await approverEmail(sb, approvedBy)
  if (isReallyLive && email) {
    const platformLabel = SOCIAL_CONNECTORS[platform]?.label || platform
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: email,
      subject: `🎬 Published automatically — live on ${platformLabel}: ${title || campaign.title}`,
      html: `
        <p>You approved <strong>${title || campaign.title}</strong>; COSA finished final preparation and it is now live on ${platformLabel} — no further action was needed.</p>
        <p><a href="${result.liveUrl}">${result.liveUrl}</a></p>
        <p>Clicks on the description link are tracked automatically; performance numbers attach to the campaign record within a day.</p>
      `.trim(),
    })
    notified = Boolean(sent?.ok)
    if (!sent?.ok) notifyError = sent?.error
  }

  await sb.from('cos_campaign_queue').update({
    status: 'running',
    metadata: {
      ...(campaign.metadata || {}),
      readiness,
      tracking_url: trackingUrl,
      auto_publish_note: null,
      published: {
        ...published,
        [publishedKey]: { result, publishedAt, language, notified, notifyError: notifyError || null, publishedBy: approvedBy, autoPublished: true },
      },
    },
  }).eq('id', campaign.id)

  return { status: 'published' }
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const { data: approved } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('status', ['approved', 'queued', 'running'])
    .not('approved_at', 'is', null)
    .not('approved_by', 'is', null)
    .gte('created_at', BACKLOG_CUTOFF)
    .limit(20)

  const results: any[] = []
  let published = 0, skipped = 0, blocked = 0, failed = 0
  for (const campaign of approved || []) {
    const r = await publishOne(sb, campaign)
    if (r.status === 'published') published++
    else if (r.status === 'skipped') skipped++
    else if (r.status === 'blocked') blocked++
    else failed++
    if (r.status !== 'skipped') results.push({ campaign: campaign.id, title: campaign.title, ...r })
  }

  return NextResponse.json({ ok: true, scanned: approved?.length || 0, published, skipped, blocked, failed, results })
}
