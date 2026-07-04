// saas/app/api/cron/cos-auto-publish-exact/route.ts
// Exact-campaign automatic publishing for final branded COSA videos.
// Also sends owner approval emails for final-ready videos before publishing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
import { sendEmail } from '@/lib/email'
import { auditAdminAction } from '@/lib/outreach/security'
import { GET as notifyFinalVideoApprovals } from '@/app/api/cos/video-approval-notify/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VIDEO_CHANNELS = ['youtube', 'short_video']
const PLATFORM = 'youtube_channels'
const LIMIT = 5
const RETRY_MINUTES = 20

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

function eligible(campaign: any): boolean {
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (String(campaign.status) !== 'approved') return false
  if (!campaign.approved_at || !campaign.approved_by) return false
  if (!finalReady(campaign)) return false
  const lang = firstLanguage(campaign)
  if (!lang) return false
  if (alreadyPublished(campaign, lang)) return false
  if (!exactFinalVideo(campaign, lang)) return false
  const last = campaign?.metadata?.autoPublishExact?.lastAttemptAt
  if (minutesSince(last) < RETRY_MINUTES) return false
  return true
}

function draftForLanguage(campaign: any, lang: string) {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const matched = items.find((it: any) => it?.input?.language === lang && it?.output) || items.find((it: any) => it?.output)
  return {
    text: matched?.output?.draft ? String(matched.output.draft) : String(campaign.objective || campaign.title || ''),
    title: matched?.output?.title ? String(matched.output.title) : String(campaign.title || ''),
  }
}

async function publishOne(sb: any, campaign: any) {
  const lang = firstLanguage(campaign)
  const videoUrl = exactFinalVideo(campaign, lang)
  if (!videoUrl) return { ok: false, error: `No exact final video for ${lang || 'unknown language'}`, language: lang || null }

  const readiness = scoreCampaignReadiness(campaign)
  const readinessOk = readiness.grade === 'improved' || readiness.grade === 'marketing_grade_ready'
  if (!readinessOk) return { ok: false, error: `Readiness blocked: ${readiness.score}/${readiness.max_score} ${readiness.grade}`, language: lang, readiness }

  const token = await getValidSocialToken(sb, String(campaign.approved_by), PLATFORM as any)
  if (!token.ok || !token.accessToken) return { ok: false, error: token.error || 'Could not obtain YouTube token', language: lang }

  const draft = draftForLanguage(campaign, lang)
  const trackingUrl = buildTrackingUrl(campaign.id, PLATFORM as any)
  const text = draft.text.includes('/api/track?') ? draft.text : `${draft.text}\n\n👉 ${trackingUrl}`.trim()
  const result = await publishSocialPost({ platform: PLATFORM as any, text, title: draft.title, videoUrl, accessToken: token.accessToken } as any)
  if (!result?.ok) return { ok: false, error: result?.mode || 'Publish failed', language: lang, result }

  const publishedAt = new Date().toISOString()
  const { data: freshRow } = await sb.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
  const freshMeta = freshRow?.metadata || campaign.metadata || {}
  await sb.from('cos_campaign_queue').update({
    status: 'running',
    metadata: {
      ...freshMeta,
      readiness,
      tracking_url: trackingUrl,
      published: {
        ...((freshMeta && freshMeta.published) || {}),
        [`${PLATFORM}::${lang}`]: { result, publishedAt, language: lang, videoUrl, publishedBy: campaign.approved_by },
      },
      autoPublishExact: {
        lastAttemptAt: publishedAt,
        ok: true,
        language: lang,
        videoUrl,
        liveUrl: result.liveUrl || null,
      },
    },
  }).eq('id', campaign.id)

  await auditAdminAction({
    admin: sb,
    actorId: String(campaign.approved_by),
    action: 'cos_campaign.auto_publish_exact',
    targetType: 'cos_campaign_queue',
    targetId: campaign.id,
    metadata: { platform: PLATFORM, language: lang, videoUrl, result },
  })

  const email = campaign?.metadata?.autoPublishArm?.email || campaign?.metadata?.approvalNotification?.email || campaign?.metadata?.video?.approvalNotification?.email
  if (result.liveUrl && email) {
    await sendEmail({
      from: 'saasMarketing',
      to: email,
      subject: `Your SignalBoostAi video is live: ${draft.title}`,
      html: `<p>Your approved video is live.</p><p><a href="${result.liveUrl}">${result.liveUrl}</a></p>`,
    })
  }

  return { ok: true, language: lang, videoUrl, liveUrl: result.liveUrl || null }
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

  const targets = (data || []).filter(eligible).slice(0, LIMIT)
  const results: any[] = []
  for (const campaign of targets) {
    const res = await publishOne(sb, campaign)
    results.push({ campaign: campaign.id, title: campaign.title, ...res })
    if (!res.ok) {
      await sb.from('cos_campaign_queue').update({
        metadata: {
          ...(campaign.metadata || {}),
          autoPublishExact: { lastAttemptAt: new Date().toISOString(), ok: false, error: res.error, language: res.language || null },
        },
      }).eq('id', campaign.id)
    }
  }

  return NextResponse.json({ ok: true, approvalEmail, scanned: data?.length || 0, eligible: targets.length, published: results.filter(r => r.ok).length, results })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
