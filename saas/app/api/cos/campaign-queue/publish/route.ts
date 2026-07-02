// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform. The approval
// gate is enforced here: nothing publishes unless the owner approved it first.
// Three AUTONOMOUS gates run before that human-approved content ever goes live:
//   1. Video channels must have a finished, rendered video (COSA isn't done yet
//      otherwise) — no human has to notice a missing video.
//   2. Video channels must have a successfully BRANDED video (name + URL burned
//      in) — an unbranded video can never publish automatically. The owner can
//      explicitly override this ONE video with acceptUnbranded:true in the
//      request body — a deliberate, logged choice, not a silent bypass.
//   3. COSA's own content-quality gate runs automatically (hero/format/CTA/
//      branding/monetization/traffic-plan). Below the bar, publish is blocked
//      and the reason is written to metadata.readiness — COSA's problem to fix,
//      not something the owner has to catch by eye.
// TRAFFIC ATTRIBUTION: the post/description text gets the campaign's tracking
// link (/api/track?c=<id>&p=<platform>) appended, so every click a viewer
// makes from the platform lands in cos_campaign_clicks before redirecting to
// the real site. The burned-in on-screen URL and the spoken narration keep
// the clean human-readable URL — only the clickable description link routes
// through tracking.
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
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
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
  const acceptUnbranded = body?.acceptUnbranded === true

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  // THE GATE: never publish anything the owner has not explicitly approved.
  // Owner approval is recorded as approved_at/approved_by on the row (and is
  // nulled on rejection). After approval, the script worker legitimately moves
  // the row from 'approved' to 'queued' while drafting — that must NOT lock
  // publishing forever. So the gate is: the owner approved it, AND the status
  // is still in the approved/queued working band (not rejected, not already
  // running/completed).
  const ownerApproved = Boolean(campaign.approved_at) && Boolean(campaign.approved_by)
  const publishableStatus = campaign.status === 'approved' || campaign.status === 'queued'
  if (!ownerApproved || !publishableStatus) {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved by the owner before publishing.' }, { status: 409 })
  }

  // AUTONOMOUS GATE 1 & 2: video channels need a finished AND branded video.
  // COSA isn't done producing yet if either isn't true — never let a missing,
  // half-finished, or unbranded (missing name/URL overlay) video go out
  // AUTOMATICALLY. acceptUnbranded is an explicit, deliberate owner override
  // for one specific video, not a way to silently disable this for everything.
  if (VIDEO_CHANNELS.includes(String(campaign.channel))) {
    const video = campaign.metadata?.video || {}
    if (video.status !== 'ready') {
      return NextResponse.json({
        ok: false,
        error: `COSA has not finished producing this video yet (status: ${video.status || 'not started'}). Publish will unlock automatically once rendering completes.`,
      }, { status: 409 })
    }
    if (video.branded !== true && !acceptUnbranded) {
      return NextResponse.json({
        ok: false,
        error: `COSA's branded overlay (name + URL burned into the video) did not complete successfully${video.voiceError ? `: ${video.voiceError}` : '.'} Publishing an unbranded video is blocked automatically. To publish this specific video anyway, resend with acceptUnbranded: true.`,
        voiceError: video.voiceError || null,
      }, { status: 409 })
    }
  }

  // AUTONOMOUS GATE 3: COSA's own quality/readiness check on the REAL content —
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
  let text = String(body?.text || draftText || campaign.objective || campaign.title || '')
  const videoUrl = body?.videoUrl ? String(body.videoUrl) : ((campaign.metadata?.video?.voicedUrl || campaign.metadata?.video?.url) ? String(campaign.metadata.video.voicedUrl || campaign.metadata.video.url) : undefined)
  const title = String(body?.title || draftTitle || campaign.title || '')

  // TRAFFIC ATTRIBUTION: append the campaign's tracking link to the clickable
  // description text, so clicks from the platform land in cos_campaign_clicks
  // and are attributable to THIS campaign. Skipped if a tracking link is
  // already present (e.g. a re-publish).
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
        [publishedKey]: { result, publishedAt, language: language || null, notified, notifyError: notifyError || null, publishedUnbranded: acceptUnbranded && campaign.metadata?.video?.branded !== true },
      },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.publish',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { platform, language: language || null, result, notified, acceptUnbranded },
  })

  return NextResponse.json({ ok: true, platform, language: language || null, publishedAt, result, readiness, notified, trackingUrl })
}
