import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { publishSocialPost, SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { getValidSocialToken } from '@/lib/outreach/social-token'

export const dynamic = 'force-dynamic'

const NEEDS_ACCOUNT_REF = new Set<SocialPlatform>(['linkedin_company', 'facebook_pages', 'instagram_business', 'reddit'])
const NEEDS_VIDEO = new Set<SocialPlatform>(['tiktok', 'youtube_channels'])
const NEEDS_MEDIA = new Set<SocialPlatform>(['instagram_business'])

function isPlatform(value: string): value is SocialPlatform {
  return Boolean((SOCIAL_CONNECTORS as any)[value])
}

function normalizePlatformFilter(body: any): Set<string> | undefined {
  const values = Array.isArray(body?.platforms)
    ? body.platforms
    : body?.platform ? [body.platform] : []
  const platforms = values.map((item: any) => String(item)).filter(isPlatform)
  return platforms.length ? new Set<string>(platforms) : undefined
}

function sendablePost(post: any, platforms?: Set<string>) {
  if (!post) return false
  if (platforms && !platforms.has(String(post.platform))) return false
  return ['approved', 'queued', 'failed_retryable'].includes(String(post.status || ''))
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const campaignId = String(body?.campaign_id || body?.campaignId || '').trim()
  if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })
  if (await isOutreachSendingDisabled(ctx.admin)) return NextResponse.json({ ok: false, error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })

  const platformFilter = normalizePlatformFilter(body)

  const { data: campaign, error } = await ctx.admin.from('outreach_social_campaigns').select('*').eq('id', campaignId).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })
  if (!['approved', 'running'].includes(String(campaign.status))) {
    return NextResponse.json({ ok: false, error: 'Campaign must be approved before publishing.' }, { status: 409 })
  }

  const { data: posts, error: postError } = await ctx.admin.from('outreach_social_campaign_posts').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true })
  if (postError) return NextResponse.json({ ok: false, error: postError.message }, { status: 500 })

  const selected = (posts || []).filter((post: any) => sendablePost(post, platformFilter))
  if (!selected.length) return NextResponse.json({ ok: false, error: 'No approved social posts are ready to publish.' }, { status: 409 })

  const limit = await enforceDailySendLimit(ctx.admin, 50)
  if (limit.count + selected.length > limit.limit) return NextResponse.json({ ok: false, error: 'Daily outreach send limit reached', sendLimit: limit }, { status: 429 })

  const results: any[] = []
  let sent = 0
  for (const post of selected) {
    const platform = String(post.platform) as SocialPlatform
    if (!SOCIAL_CONNECTORS[platform]) {
      results.push({ postId: post.id, platform, ok: false, error: 'Unsupported platform' })
      continue
    }

    const tok = await getValidSocialToken(ctx.admin, ctx.user.id, platform)
    if (!tok.ok || !tok.accessToken) {
      const errorText = tok.error || `${platform} is not connected.`
      await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'failed_retryable', error: errorText, updated_at: new Date().toISOString() }).eq('id', post.id)
      results.push({ postId: post.id, platform, ok: false, error: errorText })
      continue
    }

    const accountRef = post.account_ref || tok.accountRef || null
    if (NEEDS_ACCOUNT_REF.has(platform) && !accountRef) {
      const errorText = `${platform} requires account_ref/destination before publishing.`
      await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'failed_retryable', error: errorText, updated_at: new Date().toISOString() }).eq('id', post.id)
      results.push({ postId: post.id, platform, ok: false, error: errorText })
      continue
    }
    if (NEEDS_VIDEO.has(platform) && !post.video_url) {
      const errorText = `${platform} requires video_url before publishing.`
      await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'failed_retryable', error: errorText, updated_at: new Date().toISOString() }).eq('id', post.id)
      results.push({ postId: post.id, platform, ok: false, error: errorText })
      continue
    }
    if (NEEDS_MEDIA.has(platform) && !post.video_url && !post.image_url) {
      const errorText = `${platform} requires image_url or video_url before publishing.`
      await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'failed_retryable', error: errorText, updated_at: new Date().toISOString() }).eq('id', post.id)
      results.push({ postId: post.id, platform, ok: false, error: errorText })
      continue
    }

    const result = await publishSocialPost({
      platform,
      text: String(post.post_text || ''),
      title: post.title ? String(post.title) : campaign.name,
      imageUrl: post.image_url || undefined,
      videoUrl: post.video_url || undefined,
      accessToken: tok.accessToken,
      accountRef: accountRef || undefined,
    })

    const now = new Date().toISOString()
    if (!result.ok) {
      await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'failed_retryable', error: result.mode, metrics: result.metrics || {}, updated_at: now }).eq('id', post.id)
      results.push({ postId: post.id, platform, ok: false, error: result.mode, result })
      continue
    }

    await ctx.admin.from('outreach_social_campaign_posts').update({ status: 'sent', provider_post_id: result.providerPostId, live_url: result.liveUrl, metrics: result.metrics || {}, error: null, sent_at: now, updated_at: now }).eq('id', post.id)
    await ctx.admin.from('outreach_sends').insert({ outreach_id: null, business_id: campaign.id, channel: platform, sent_at: now, metadata: { socialCampaignId: campaign.id, socialPostId: post.id, providerResult: result, metrics: result.metrics } })
    sent++
    results.push({ postId: post.id, platform, ok: true, liveUrl: result.liveUrl, providerPostId: result.providerPostId })
  }

  const finalStatus = sent === selected.length ? 'sent' : sent > 0 ? 'partial_sent' : 'publish_failed'
  await ctx.admin.from('outreach_social_campaigns').update({ status: finalStatus, updated_at: new Date().toISOString(), metadata: { ...(campaign.metadata || {}), lastPublishResults: results } }).eq('id', campaignId)
  await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.campaign.publish', targetType: 'outreach_social_campaigns', targetId: campaignId, metadata: { selected: selected.length, sent, finalStatus, results } })

  return NextResponse.json({ ok: sent > 0, campaignId, selected: selected.length, sent, status: finalStatus, results, sendLimit: { ...limit, count: limit.count + sent } }, { status: sent > 0 ? 200 : 502 })
}
