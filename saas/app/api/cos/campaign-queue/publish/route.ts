// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform — thin HTTP
// wrapper over lib/cos/campaign-queue/publish-core.ts, which holds ALL gates:
//   - THE OWNER GATE: approved_at/approved_by must be set (nulled on rejection);
//     status must be in the approved | queued | running band.
//   - Video ready + branded (acceptUnbranded:true is a logged owner override).
//   - COSA quality/readiness gate.
//   - Traffic attribution link appended; owner emailed the live link.
// The same core is invoked automatically on approval (PATCH status=approved in
// ../route.ts) — this endpoint remains for manual/per-language re-publish.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import type { SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}

  const res = await publishCampaignCore({
    admin: ctx.admin,
    userId: ctx.user.id,
    userEmail: ctx.user.email || null,
    id: String(body?.id || ''),
    language: typeof body?.language === 'string' ? body.language : undefined,
    acceptUnbranded: body?.acceptUnbranded === true,
    platform: body?.platform as SocialPlatform | undefined,
    text: typeof body?.text === 'string' ? body.text : undefined,
    videoUrl: typeof body?.videoUrl === 'string' ? body.videoUrl : undefined,
    title: typeof body?.title === 'string' ? body.title : undefined,
  })

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, platform: res.platform, result: res.result, readiness: res.readiness, voiceError: res.voiceError },
      { status: res.status },
    )
  }

  return NextResponse.json({
    ok: true,
    platform: res.platform,
    language: res.language,
    publishedAt: res.publishedAt,
    result: res.result,
    readiness: res.readiness,
    notified: res.notified,
    trackingUrl: res.trackingUrl,
  })
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
        [publishedKey]: { result, publishedAt, language: language || null, notified, notifyError: notifyError || null, publishedBy: ctx.user.id, publishedUnbranded: acceptUnbranded && campaign.metadata?.video?.branded !== true },
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
