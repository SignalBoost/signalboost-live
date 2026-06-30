// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform. The approval
// gate is enforced here: nothing publishes unless the owner approved it first.
// Language-aware: when a language is given (or owner text is not), the matching
// per-language draft (work_items[].output) is used. Owner-reviewed content
// (body.text / body.videoUrl) always wins. Published results are keyed by
// platform + language so multiple languages to one platform never clobber.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

// COS channels that map to a direct social post. Others (blog/email/landing_page/
// outreach/review_campaign) are handled by their own flows.
const CHANNEL_TO_PLATFORM: Record<string, SocialPlatform | undefined> = {
  youtube: 'youtube_channels',
  short_video: 'tiktok',
  linkedin: 'linkedin_company',
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

  // THE GATE: never publish anything the owner has not explicitly approved.
  if (campaign.status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved before publishing.' }, { status: 409 })
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
  const videoUrl = body?.videoUrl ? String(body.videoUrl) : (campaign.assets?.video_url ? String(campaign.assets.video_url) : undefined)
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
  await ctx.admin.from('cos_campaign_queue').update({
    status: 'running',
    metadata: {
      ...(campaign.metadata || {}),
      published: { ...((campaign.metadata && campaign.metadata.published) || {}), [publishedKey]: { result, publishedAt, language: language || null } },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.publish',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { platform, language: language || null, result },
  })

  return NextResponse.json({ ok: true, platform, language: language || null, publishedAt, result })
}
