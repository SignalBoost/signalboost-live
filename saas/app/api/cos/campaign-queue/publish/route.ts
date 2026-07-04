// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform. The approval
// gate is enforced here: nothing publishes unless the campaign is approved.
// Video campaigns publish the exact approved campaign row, using only the final
// branded video URL stored on that row.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CHANNEL_TO_PLATFORM: Record<string, SocialPlatform | undefined> = {
  youtube: 'youtube_channels',
  short_video: 'youtube_channels',
  linkedin: 'linkedin_company',
}

const VIDEO_CHANNELS = ['youtube', 'short_video']

function campaignLanguage(campaign: any): string {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.filter(Boolean).map(String) : []
  if (langs.length) return langs[0]
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const first = items.find((it: any) => it?.input?.language)
  return first?.input?.language ? String(first.input.language) : ''
}

function finalVideoForLanguage(campaign: any, language: string): string | null {
  const vmeta = campaign?.metadata?.video || {}
  const voiced = vmeta.voiced && typeof vmeta.voiced === 'object' ? vmeta.voiced : {}
  const brandedLangs = vmeta.brandedLangs && typeof vmeta.brandedLangs === 'object' ? vmeta.brandedLangs : {}
  if (language && brandedLangs[language] && voiced[language]) return String(voiced[language])
  const knownLangs = Array.from(new Set([
    ...(Array.isArray(campaign.languages) ? campaign.languages.map(String) : []),
    ...Object.keys(brandedLangs),
    ...Object.keys(voiced),
  ].filter(Boolean)))
  if (knownLangs.length <= 1 && vmeta.branded === true && vmeta.voicedUrl) return String(vmeta.voicedUrl)
  return null
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  // THE GATE: never publish anything that has not been approved.
  if (campaign.status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved before publishing.' }, { status: 409 })
  }

  const platform = (body?.platform as SocialPlatform) || CHANNEL_TO_PLATFORM[String(campaign.channel)]
  if (!platform || !SOCIAL_CONNECTORS[platform]) {
    return NextResponse.json({ ok: false, error: `Channel "${campaign.channel}" is not a direct social-post target. Pass an explicit platform to override.` }, { status: 400 })
  }

  const language = String(body?.language || campaignLanguage(campaign) || '').trim()
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const matched = language
    ? items.find((it: any) => it?.input?.language === language && it?.output)
    : items.find((it: any) => it?.output)
  const draftText = matched?.output?.draft ? String(matched.output.draft) : ''
  const draftTitle = matched?.output?.title ? String(matched.output.title) : ''

  const vmeta = campaign.metadata?.video || {}
  let videoUrl: string | undefined

  if (VIDEO_CHANNELS.includes(String(campaign.channel))) {
    if (vmeta.status !== 'ready') {
      return NextResponse.json({ ok: false, error: `COSA has not finished producing this video yet (status: ${vmeta.status || 'not started'}).` }, { status: 409 })
    }
    if (vmeta.branded !== true) {
      return NextResponse.json({ ok: false, error: 'The mandatory SignalBoostAi brand banner is not on this video yet. Publishing is blocked.' }, { status: 409 })
    }
    const exactFinal = finalVideoForLanguage(campaign, language)
    if (!exactFinal) {
      return NextResponse.json({ ok: false, error: `No matching final branded video found for language ${language || 'unknown'}. Publishing refuses to fall back to another language/video.` }, { status: 409 })
    }
    videoUrl = exactFinal
  }

  const readiness = scoreCampaignReadiness(campaign)
  const readinessOk = readiness.grade === 'improved' || readiness.grade === 'marketing_grade_ready'
  if (!readinessOk) {
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), readiness } }).eq('id', id)
    return NextResponse.json({ ok: false, error: `COSA scored this campaign ${readiness.score}/${readiness.max_score} (${readiness.grade}) — below the publish bar. Missing: ${readiness.failed_features.join(', ') || 'none listed'}.`, readiness }, { status: 422 })
  }

  let text = String(body?.text || draftText || campaign.objective || campaign.title || '')
  const title = String(body?.title || draftTitle || campaign.title || '')
  const trackingUrl = buildTrackingUrl(campaign.id, platform)
  if (!text.includes('/api/track?')) text = `${text}\n\n👉 ${trackingUrl}`.trim()

  const tok = await getValidSocialToken(ctx.admin, ctx.user.id, platform)
  if (!tok.ok || !tok.accessToken) return NextResponse.json({ ok: false, error: tok.error || 'Could not obtain a valid token.' }, { status: 400 })

  let result: any
  try {
    result = await publishSocialPost({ platform, text, videoUrl, title, accessToken: tok.accessToken } as any)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Publish failed', platform }, { status: 502 })
  }
  if (!result?.ok) return NextResponse.json({ ok: false, error: result?.mode || 'Publish failed', platform, result }, { status: 502 })

  const publishedAt = new Date().toISOString()
  const publishedKey = language ? `${platform}::${language}` : platform
  const isReallyLive = Boolean(result.liveUrl) && !String(result.mode || '').includes('not_configured')
  let notified = false
  let notifyError: string | undefined
  if (isReallyLive && ctx.user.email) {
    const platformLabel = SOCIAL_CONNECTORS[platform]?.label || platform
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: ctx.user.email,
      subject: `🎬 Your video is live on ${platformLabel}: ${title || campaign.title}`,
      html: `
        <p>COSA finished the full pipeline for <strong>${title || campaign.title}</strong> and it is now live on ${platformLabel}.</p>
        <p><a href="${result.liveUrl}">${result.liveUrl}</a></p>
        <p>Clicks on the description link are being tracked automatically.</p>
      `.trim(),
    })
    notified = Boolean(sent?.ok)
    if (!sent?.ok) notifyError = sent?.error
  }

  await ctx.admin.from('cos_campaign_queue').update({
    status: 'running',
    metadata: {
      ...(campaign.metadata || {}),
      readiness,
      tracking_url: trackingUrl,
      published: {
        ...((campaign.metadata && campaign.metadata.published) || {}),
        [publishedKey]: { result, publishedAt, language: language || null, videoUrl, notified, notifyError: notifyError || null, publishedBy: ctx.user.id },
      },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.publish',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { platform, language: language || null, videoUrl, result, notified },
  })

  return NextResponse.json({ ok: true, platform, language: language || null, videoUrl, publishedAt, result, readiness, notified, trackingUrl })
}
