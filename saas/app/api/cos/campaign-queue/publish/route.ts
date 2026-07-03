// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform. The approval
// gate is enforced here: nothing publishes unless the campaign is approved —
// either by the owner's click, or by the owner's chat command (chat-created
// video campaigns arrive already approved with the internal marker).
// Three AUTONOMOUS gates run before that approved content ever goes live:
//   1. Video channels must have a finished, rendered video.
//   2. Video channels must carry the mandatory burned-in brand banner
//      (SignalBoostAi + www.saas.signalboostapp.com). NO OVERRIDE EXISTS —
//      an unbranded video can never publish, by design.
//   3. COSA's own content-quality gate runs automatically.
// TRAFFIC ATTRIBUTION: the description text gets the campaign's tracking link
// (/api/track?c=<id>&p=<platform>) appended, so every click lands in
// cos_campaign_clicks before redirecting to the real site.
// TOKEN OWNERSHIP: the published entry records publishedBy (the real user
// whose OAuth token published it) so the measurement cron can read platform
// stats later — critical for chat-created campaigns whose approved_by is the
// internal marker 'cos_internal_preparation', not a real user id.
// After a real (non-stub) publish, the owner is emailed the live link.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
import { sendEmail, SENDERS } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CHANNEL_TO_PLATFORM: Record<string, SocialPlatform | undefined> = {
  youtube: 'youtube_channels',
  short_video: 'tiktok',
  linkedin: 'linkedin_company',
}

const VIDEO_CHANNELS = ['youtube', 'short_video']
const MIN_READINESS_SCORE = 7 // matches the 'improved'+ grade floor in video-quality/scoring.ts

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

  // AUTONOMOUS GATE 1 & 2: video channels need a finished AND branded video.
  if (VIDEO_CHANNELS.includes(String(campaign.channel))) {
    const video = campaign.metadata?.video || {}
    if (video.status !== 'ready') {
      return NextResponse.json({
        ok: false,
        error: `COSA has not finished producing this video yet (status: ${video.status || 'not started'}). Publish will unlock automatically once rendering completes.`,
      }, { status: 409 })
    }
    if (video.branded !== true || !video.voicedUrl) {
      return NextResponse.json({
        ok: false,
        error: `The mandatory brand banner (SignalBoostAi + www.saas.signalboostapp.com burned into the video) is not on this video yet${video.voiceError ? `: ${video.voiceError}` : '.'} Publishing without the banner is blocked — no override. The GitHub Actions FFmpeg worker burns it in automatically; publish unlocks when done.`,
        voiceError: video.voiceError || null,
      }, { status: 409 })
    }
  }

  // AUTONOMOUS GATE 3: COSA's own quality/readiness check on the REAL content.
  const readiness = scoreCampaignReadiness(campaign)
  const readinessOk = readiness.grade === 'improved' || readiness.grade === 'marketing_grade_ready'
  if (!readinessOk) {
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), readiness },
    }).eq('id', id)
    return NextResponse.json({
      ok: false,
      error: `COSA scored this campaign ${readiness.score}/${readiness.max_score} (${readiness.grade}) — below the publish bar. Missing: ${readiness.failed_features.join(', ') || 'none listed'}.`,
      readiness,
    }, { status: 422 })
  }

  const platform = (body?.platform as SocialPlatform) || CHANNEL_TO_PLATFORM[String(campaign.channel)]
  if (!platform || !SOCIAL_CONNECTORS[platform]) {
    return NextResponse.json({ ok: false, error: `Channel "${campaign.channel}" is not a direct social-post target. Pass an explicit platform to override.` }, { status: 400 })
  }

  // Resolve the per-language draft. When a language is given, use that draft;
  // otherwise fall back to the first drafted work item.
  const language = String(body?.language || '').trim()
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const matched = language
    ? items.find((it: any) => it?.input?.language === language && it?.output)
    : items.find((it: any) => it?.output)
  const draftText = matched?.output?.draft ? String(matched.output.draft) : ''
  const draftTitle = matched?.output?.title ? String(matched.output.title) : ''

  // Owner-approved content wins; then the per-language draft; then stored fields.
  let text = String(body?.text || draftText || campaign.objective || campaign.title || '')
  // BANNER GUARANTEE: only banner-burned URLs may publish — per-language branded
  // output first, then the branded primary. NEVER the raw unbranded render.
  const vmeta = campaign.metadata?.video || {}
  const brandedForLang = language && vmeta.brandedLangs?.[language] ? vmeta.voiced?.[language] : null
  const videoUrl = brandedForLang ? String(brandedForLang) : (vmeta.voicedUrl ? String(vmeta.voicedUrl) : undefined)
  const title = String(body?.title || draftTitle || campaign.title || '')

  // TRAFFIC ATTRIBUTION: append the campaign's tracking link to the clickable
  // description text. Skipped if a tracking link is already present.
  const trackingUrl = buildTrackingUrl(campaign.id, platform)
  if (!text.includes('/api/track?')) {
    text = `${text}\n\n👉 ${trackingUrl}`.trim()
  }

  const tok = await getValidSocialToken(ctx.admin, ctx.user.id, platform)
  if (!tok.ok || !tok.accessToken) {
    return NextResponse.json({ ok: false, error: tok.error || 'Could not obtain a valid token.' }, { status: 400 })
  }

  let result: any
  try {
    result = await publishSocialPost({ platform, text, videoUrl, title, accessToken: tok.accessToken } as any)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Publish failed', platform }, { status: 502 })
  }
  if (!result?.ok) {
    return NextResponse.json({ ok: false, error: result?.mode || 'Publish failed', platform, result }, { status: 502 })
  }

  const publishedAt = new Date().toISOString()
  const publishedKey = language ? `${platform}::${language}` : platform
  const isReallyLive = Boolean(result.liveUrl) && !String(result.mode || '').includes('not_configured')

  // AUTO-NOTIFY: tell the owner it's live, with the actual watch/post link.
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
        <p>Clicks on the description link are being tracked — traffic numbers will appear on the campaign record automatically.</p>
        <p>Click through to verify it looks right. No further action needed unless something looks off.</p>
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
        [publishedKey]: { result, publishedAt, language: language || null, notified, notifyError: notifyError || null, publishedBy: ctx.user.id },
      },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.publish',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { platform, language: language || null, result, notified },
  })

  return NextResponse.json({ ok: true, platform, language: language || null, publishedAt, result, readiness, notified, trackingUrl })
}
