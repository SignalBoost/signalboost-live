// saas/lib/cos/campaign-queue/publish-core.ts
// SHARED publish engine for COS campaigns. Used by BOTH:
//   1. POST /api/cos/campaign-queue/publish  (manual button in /dashboard/cosa)
//   2. PATCH /api/cos/campaign-queue on status=approved (AUTO-PUBLISH: the owner
//      approves, and the AI does the rest — publish and tracking link).
//
// THE GATE (identical everywhere): nothing publishes unless the OWNER approved
// it (approved_at + approved_by set on the row; both are nulled on rejection).
// After approval the script worker legitimately moves status approved->queued,
// and a first publish moves it to running — none of those may lock publishing,
// so the status band accepted here is approved | queued | running.
//
// Three AUTONOMOUS gates then run before human-approved content goes live:
//   1. Video channels must have a finished, rendered video.
//   2. Video channels must have a successfully BRANDED video (name + URL burned
//      in). acceptUnbranded:true is a deliberate, logged owner override for ONE
//      video — never a silent bypass.
//   3. COSA's content-quality gate (hero/format/CTA/branding/monetization/
//      traffic-plan). Below the bar, publish is blocked and the reason is
//      written to metadata.readiness.
//
// TRAFFIC ATTRIBUTION: the clickable description gets the campaign's tracking
// link (/api/track?c=<id>&p=<platform>) appended, so every viewer click lands
// in cos_campaign_clicks before redirecting to the real site.
//
// NOTIFICATION: this engine stores the provider-confirmed live URL. A separate
// compatibility notifier sends only the publication location and retries email
// delivery without publishing again.

import { getValidSocialToken } from '@/lib/outreach/social-token'
import { resolvePublishMode } from '@/lib/outreach/publish-mode'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { scoreCampaignReadiness } from '@/lib/cos/video-quality/campaign-scoring'
import { buildTrackingUrl } from '@/lib/cos/campaign-queue/campaign-traffic'
import { auditAdminAction } from '@/lib/outreach/security'
import { verifyApprovalBinding } from '@/lib/cos/campaign-queue/approvalBinding'

// COS channels that map to a direct social post. Others (blog/email/landing_page/
// outreach/review_campaign) are handled by their own flows.
export const CHANNEL_TO_PLATFORM: Record<string, SocialPlatform | undefined> = {
  youtube: 'youtube_channels',
  short_video: 'youtube_channels',
  linkedin: 'linkedin_company',
  twitter: 'twitter_x',
  x: 'twitter_x',
  facebook: 'facebook_pages',
  instagram: 'instagram_business',
  tiktok: 'tiktok',
  reddit: 'reddit',
}

const VIDEO_CHANNELS = ['youtube', 'short_video']

export type PublishCoreInput = {
  admin: any
  userId: string
  userEmail?: string | null
  id: string
  language?: string
  acceptUnbranded?: boolean
  platform?: SocialPlatform
  text?: string
  videoUrl?: string
  title?: string
}

export type PublishCoreResult = {
  ok: boolean
  status: number
  error?: string
  platform?: string
  language?: string | null
  publishedAt?: string
  result?: any
  readiness?: any
  notified?: boolean
  trackingUrl?: string
  voiceError?: string | null
}

export async function publishCampaignCore(input: PublishCoreInput): Promise<PublishCoreResult> {
  const { admin, userId } = input
  const id = String(input.id || '').trim()
  if (!id) return { ok: false, status: 400, error: 'id is required' }
  const acceptUnbranded = input.acceptUnbranded === true

  const { data: campaign, error } = await admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return { ok: false, status: 404, error: error?.message || 'Campaign not found' }

  // THE GATE: never publish anything the owner has not explicitly approved.
  const ownerApproved = Boolean(campaign.approved_at) && Boolean(campaign.approved_by)
  const publishableStatus = ['approved', 'queued', 'running'].includes(String(campaign.status))
  if (!ownerApproved || !publishableStatus) {
    return { ok: false, status: 409, error: 'Campaign must be approved by the owner before publishing.' }
  }

  // VERSION BINDING: the live content must still match what the owner approved.
  const binding = verifyApprovalBinding(campaign)
  if (!binding.ok) {
    return { ok: false, status: 409, error: binding.reason }
  }

  // AUTONOMOUS GATE 1 & 2: video channels need a finished AND branded video.
  if (VIDEO_CHANNELS.includes(String(campaign.channel))) {
    const video = campaign.metadata?.video || {}
    if (video.status !== 'ready') {
      return {
        ok: false,
        status: 409,
        error: `COSA has not finished producing this video yet (status: ${video.status || 'not started'}). Publish will unlock automatically once rendering completes.`,
      }
    }
    if (video.branded !== true && !acceptUnbranded) {
      return {
        ok: false,
        status: 409,
        error: `COSA's branded overlay (name + URL burned into the video) did not complete successfully${video.voiceError ? `: ${video.voiceError}` : '.'} Publishing an unbranded video is blocked automatically. To publish this specific video anyway, resend with acceptUnbranded: true.`,
        voiceError: video.voiceError || null,
      }
    }
  }

  // AUTONOMOUS GATE 3: COSA's own quality/readiness check on the REAL content.
  const readiness = scoreCampaignReadiness(campaign)
  const readinessOk = readiness.grade === 'improved' || readiness.grade === 'marketing_grade_ready'
  if (!readinessOk) {
    await admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), readiness },
    }).eq('id', id)
    return {
      ok: false,
      status: 422,
      error: `COSA scored this campaign ${readiness.score}/${readiness.max_score} (${readiness.grade}) — below the publish bar. Missing: ${readiness.failed_features.join(', ') || 'none listed'}.`,
      readiness,
    }
  }

  const platform = input.platform || CHANNEL_TO_PLATFORM[String(campaign.channel)]
  if (!platform || !SOCIAL_CONNECTORS[platform]) {
    return { ok: false, status: 400, error: `Channel "${campaign.channel}" is not a direct social-post target. Pass an explicit platform to override.` }
  }

  // Resolve the per-language draft. When a language is given, use that draft;
  // otherwise fall back to the first drafted work item.
  const language = String(input.language || '').trim()
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const matched = language
    ? items.find((it: any) => it?.input?.language === language && it?.output)
    : items.find((it: any) => it?.output)
  const draftText = matched?.output?.draft ? String(matched.output.draft) : ''
  const draftTitle = matched?.output?.title ? String(matched.output.title) : ''

  // Owner-approved content wins; then the per-language draft; then stored fields.
  let text = String(input.text || draftText || campaign.objective || campaign.title || '')
  const videoUrl = input.videoUrl
    ? String(input.videoUrl)
    : ((campaign.metadata?.video?.voicedUrl || campaign.metadata?.video?.url)
      ? String(campaign.metadata.video.voicedUrl || campaign.metadata.video.url)
      : undefined)
  const title = String(input.title || draftTitle || campaign.title || '')

  // TRAFFIC ATTRIBUTION: append the campaign's tracking link to the clickable
  // description text. Skipped if a tracking link is already present.
  const trackingUrl = buildTrackingUrl(campaign.id, platform)
  if (!text.includes('/api/track?')) {
    text = `${text}\n\n👉 ${trackingUrl}`.trim()
  }

  const tok = await getValidSocialToken(admin, userId, platform)
  if (!tok.ok || !tok.accessToken) {
    return { ok: false, status: 400, error: tok.error || 'Could not obtain a valid token.' }
  }

  const publishMode = await resolvePublishMode(admin, userId, platform)
  let result: any
  try {
    result = await publishSocialPost({ platform, text, videoUrl, title, publishMode, accountRef: tok.accountRef, accountName: tok.accountName, accessToken: tok.accessToken } as any)
  } catch (error: any) {
    return { ok: false, status: 502, error: error?.message || 'Publish failed', platform }
  }
  if (!result?.ok) {
    return { ok: false, status: 502, error: result?.mode || 'Publish failed', platform, result }
  }

  const isReallyLive = Boolean(result.liveUrl) && !String(result.mode || '').includes('not_configured')
  if (!isReallyLive) {
    return {
      ok: false,
      status: 502,
      error: 'Provider did not return a confirmed live publication URL.',
      platform,
      result,
    }
  }

  const publishedAt = new Date().toISOString()
  const publishedKey = language ? `${platform}::${language}` : platform

  // Re-read metadata just before writing so sequential multi-language publishes
  // merge into published{} instead of clobbering each other.
  const { data: freshRow } = await admin.from('cos_campaign_queue').select('metadata').eq('id', id).single()
  const freshMeta = (freshRow && freshRow.metadata) || campaign.metadata || {}

  await admin.from('cos_campaign_queue').update({
    status: 'running',
    metadata: {
      ...freshMeta,
      readiness,
      tracking_url: trackingUrl,
      published: {
        ...((freshMeta && freshMeta.published) || {}),
        [publishedKey]: {
          result,
          publishedAt,
          language: language || null,
          notified: false,
          notifyError: null,
          publishedUnbranded: acceptUnbranded && campaign.metadata?.video?.branded !== true,
        },
      },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin,
    actorId: userId,
    action: 'cos_campaign.publish',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { platform, language: language || null, result, notified: false, acceptUnbranded },
  })

  return { ok: true, status: 200, platform, language: language || null, publishedAt, result, readiness, notified: false, trackingUrl }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-PUBLISH ON APPROVAL — "the owner approves, the AI does the rest."
// Publishes every language that has a completed draft, using the per-language
// voiced video when one exists (metadata.video.voiced[lang]); languages without
// their own voiced render fall back to the campaign's default video only for
// the FIRST published language, and are skipped otherwise (never post the wrong
// language's audio). Every outcome — success or failure — is written to
// metadata.autoPublish so nothing fails silently.
// ─────────────────────────────────────────────────────────────────────────────

export async function autoPublishApprovedCampaign(opts: {
  admin: any
  userId: string
  userEmail?: string | null
  campaignId: string
}): Promise<{ attempted: number; published: number; results: Array<{ language: string | null; ok: boolean; error?: string; liveUrl?: string }> }> {
  const { admin, userId, userEmail, campaignId } = opts
  const summary: Array<{ language: string | null; ok: boolean; error?: string; liveUrl?: string }> = []

  const { data: campaign } = await admin.from('cos_campaign_queue').select('*').eq('id', campaignId).single()
  if (!campaign) return { attempted: 0, published: 0, results: [{ language: null, ok: false, error: 'Campaign not found' }] }

  // Non-social channels are not auto-published here — their own flows handle them.
  if (!CHANNEL_TO_PLATFORM[String(campaign.channel)]) {
    return { attempted: 0, published: 0, results: [] }
  }

  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const draftedLangs: string[] = Array.from(new Set(
    items.filter((it: any) => it?.output).map((it: any) => String(it?.input?.language || '')).filter(Boolean),
  ))
  const voiced: Record<string, string> = (campaign.metadata?.video?.voiced && typeof campaign.metadata.video.voiced === 'object')
    ? campaign.metadata.video.voiced
    : {}

  // Languages with their own voiced render publish with that exact video.
  // If none have one, publish only the first drafted language with the default
  // video. If there are no per-language drafts at all, publish once untargeted.
  const withOwnVideo = draftedLangs.filter(language => voiced[language])
  const targets: Array<{ language?: string; videoUrl?: string }> =
    withOwnVideo.length > 0
      ? withOwnVideo.map(language => ({ language, videoUrl: String(voiced[language]) }))
      : draftedLangs.length > 0
        ? [{ language: draftedLangs[0] }]
        : [{}]

  let published = 0
  for (const target of targets) {
    const result = await publishCampaignCore({
      admin,
      userId,
      userEmail,
      id: campaignId,
      language: target.language,
      videoUrl: target.videoUrl,
    })
    if (result.ok) published += 1
    summary.push({
      language: target.language || null,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      liveUrl: result.ok ? (result.result?.liveUrl || undefined) : undefined,
    })
    // A hard approval/ownership gate failure will fail for every language — stop early.
    if (!result.ok && result.status === 409 && String(result.error || '').includes('approved by the owner')) break
  }

  // Record the outcome on the campaign so nothing fails silently.
  const { data: freshRow } = await admin.from('cos_campaign_queue').select('metadata').eq('id', campaignId).single()
  const freshMeta = (freshRow && freshRow.metadata) || {}
  await admin.from('cos_campaign_queue').update({
    metadata: {
      ...freshMeta,
      autoPublish: {
        ranAt: new Date().toISOString(),
        attempted: targets.length,
        published,
        results: summary,
      },
    },
  }).eq('id', campaignId)

  return { attempted: targets.length, published, results: summary }
}
