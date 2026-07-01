// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform. The approval
// gate is enforced here: nothing publishes unless the owner approved it first.
// Two AUTONOMOUS gates run before that human-approved content ever goes live:
//   1. Video channels must have a finished, rendered video (COSA isn't done yet
//      otherwise) — no human has to notice a missing video.
//   2. COSA's own content-quality gate runs automatically (hero/format/CTA/
//      branding/monetization/traffic-plan). Below the bar, publish is blocked
//      and the reason is written to metadata.readiness — COSA's problem to fix,
//      not something the owner has to catch by eye.
// Language-aware: when a language is given (or owner text is not), the matching
// per-language draft (work_items[].output) is used. Owner-reviewed content
// (body.text / body.videoUrl) always wins. Published results are keyed by
// platform + language so multiple languages to one platform never clobber.
// After a real (non-stub) publish, the owner is emailed the live link
// automatically — the last mile of "AI does the work, human just gets told."

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { sendEmail, SENDERS } from '@/lib/email'

export const dynamic = 'force-dynamic'

// COS channels that map to a direct social post. Others (blog/email/landing_page/
// outreach/review_campaign) are handled by their own flows.
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

  // THE GATE: never publish anything the owner has not explicitly approved.
  if (campaign.status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved before publishing.' }, { status: 409 })
  }

  // AUTONOMOUS GATE 1: video channels need a finished, rendered video. COSA
  // isn't done producing yet if this isn't true — never let a half-finished
  // or missing video go out, whether triggered by a human or a script.
  if (VIDEO_CHANNELS.includes(String(campaign.channel))) {
    const videoStatus = campaign.metadata?.video?.status
    if (videoStatus !== 'ready') {
      return NextResponse.json({
        ok: false,
        error: `COSA has not finished producing this video yet (status: ${videoStatus || 'not started'}). Publish will unlock automatically once rendering completes.`,
      }, { status: 409 })
    }
  }

  // AUTONOMOUS GATE 2: COSA's own quality/readiness check on the REAL content —
  // not a demo. Runs every time, no human has to remember to review it.
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
  const text = String(body?.text || draftText || campaign.objective || campaign.title || '')
  const videoUrl = body?.videoUrl ? String(body.videoUrl) : ((campaign.metadata?.video?.voicedUrl || campaign.metadata?.video?.url) ? String(campaign.metadata.video.voicedUrl || campaign.metadata.video.url) : undefined)
  const title = String(body?.title || draftTitle || campaign.title || '')

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

  // AUTO-NOTIFY: tell the owner it's live, with the actual watch/post link, the
  // moment it happens — no one has to remember to go check.
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
      published: {
        ...((campaign.metadata && campaign.metadata.published) || {}),
        [publishedKey]: { result, publishedAt, language: language || null, notified, notifyError: notifyError || null },
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

  return NextResponse.json({ ok: true, platform, language: language || null, publishedAt, result, readiness, notified })
}
