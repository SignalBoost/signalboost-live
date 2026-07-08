import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

type PlatformDraft = {
  platform: SocialPlatform
  text: string
  title?: string
  accountRef?: string
  accountName?: string
  imageUrl?: string
  videoUrl?: string
}

const PLATFORM_LIMITS: Partial<Record<SocialPlatform, number>> = {
  twitter_x: 260,
  reddit: 4000,
  linkedin_company: 2800,
  facebook_pages: 5000,
  instagram_business: 2200,
  tiktok: 2200,
  youtube_channels: 4800,
}

function isPlatform(value: string): value is SocialPlatform {
  return Boolean((SOCIAL_CONNECTORS as any)[value])
}

function normalizePlatforms(value: any): SocialPlatform[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return Array.from(new Set(list.map(item => String(item).trim()).filter(isPlatform)))
}

function cleanText(value: any, fallback = '', max = 5000) {
  const text = String(value || fallback).replace(/\s+/g, ' ').trim()
  return text.slice(0, max)
}

function defaultPostText(args: { platform: SocialPlatform; objective: string; targetAudience: string; targetUrl: string; language: string }) {
  const base = cleanText(args.objective, 'SignalBoost helps businesses turn scattered marketing, sales, and content work into approved campaigns.', 800)
  const audience = cleanText(args.targetAudience, 'business owners and operators', 180)
  const url = cleanText(args.targetUrl, 'https://www.saas.signalboostapp.com', 220)
  const platformIntro: Record<string, string> = {
    linkedin_company: `For ${audience}: ${base}`,
    reddit: `${base}\n\nQuestion for ${audience}: what part of campaign execution takes the most manual time today?`,
    twitter_x: `${base}`,
    facebook_pages: `${base}`,
    instagram_business: `${base}`,
    tiktok: `${base}`,
    youtube_channels: `${base}`,
  }
  const limit = PLATFORM_LIMITS[args.platform] || 2800
  return cleanText(`${platformIntro[args.platform] || base}\n\nLearn more: ${url}`, '', limit)
}

function platformDrafts(body: any, platforms: SocialPlatform[]) {
  const draftMap = Array.isArray(body?.drafts) ? body.drafts : []
  const objective = cleanText(body?.objective, 'Launch a SignalBoost social outreach campaign.', 1200)
  const targetAudience = cleanText(body?.target_audience || body?.targetAudience, 'small and mid-size business owners', 240)
  const targetUrl = cleanText(body?.target_url || body?.targetUrl, 'https://www.saas.signalboostapp.com', 300)
  const language = cleanText(body?.language, 'en', 12)
  return platforms.map(platform => {
    const supplied = draftMap.find((item: any) => String(item?.platform) === platform) || {}
    const text = cleanText(supplied.text || body?.text, defaultPostText({ platform, objective, targetAudience, targetUrl, language }), PLATFORM_LIMITS[platform] || 2800)
    return {
      platform,
      text,
      title: cleanText(supplied.title || body?.title || body?.name, 'SignalBoost AI growth campaign', 280),
      accountRef: supplied.account_ref || supplied.accountRef || body?.account_refs?.[platform] || body?.accountRef || null,
      accountName: supplied.account_name || supplied.accountName || body?.account_names?.[platform] || body?.accountName || null,
      imageUrl: supplied.image_url || supplied.imageUrl || body?.image_url || body?.imageUrl || null,
      videoUrl: supplied.video_url || supplied.videoUrl || body?.video_url || body?.videoUrl || null,
    } as PlatformDraft
  })
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data: campaigns, error } = await ctx.admin
    .from('outreach_social_campaigns')
    .select('*, posts:outreach_social_campaign_posts(*)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, campaigns: campaigns || [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const platforms = normalizePlatforms(body?.platforms || body?.platform)
  if (!platforms.length) return NextResponse.json({ ok: false, error: 'At least one supported platform is required.' }, { status: 400 })

  const name = cleanText(body?.name || body?.title, 'SignalBoost social outreach campaign', 160)
  const objective = cleanText(body?.objective, 'Generate qualified attention and leads for SignalBoost.', 1500)
  const targetUrl = cleanText(body?.target_url || body?.targetUrl, 'https://www.saas.signalboostapp.com', 300)
  const targetAudience = cleanText(body?.target_audience || body?.targetAudience, 'business owners and operators', 280)
  const language = cleanText(body?.language, 'en', 12)
  const autoApprove = body?.auto_approve === true || body?.autoApprove === true

  const { data: campaign, error } = await ctx.admin.from('outreach_social_campaigns').insert({
    owner_id: ctx.user.id,
    name,
    objective,
    target_url: targetUrl,
    target_audience: targetAudience,
    language,
    platforms,
    status: autoApprove ? 'approved' : 'pending_approval',
    approved_by: autoApprove ? ctx.user.id : null,
    approved_at: autoApprove ? new Date().toISOString() : null,
    metadata: { source: 'social_campaign_api', requestedPlatforms: platforms, autoApprove },
  }).select('*').single()

  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Could not create campaign' }, { status: 500 })

  const drafts = platformDrafts(body, platforms)
  const { data: posts, error: postError } = await ctx.admin.from('outreach_social_campaign_posts').insert(drafts.map(draft => ({
    campaign_id: campaign.id,
    platform: draft.platform,
    account_ref: draft.accountRef || null,
    account_name: draft.accountName || null,
    post_text: draft.text,
    title: draft.title || null,
    image_url: draft.imageUrl || null,
    video_url: draft.videoUrl || null,
    status: autoApprove ? 'approved' : 'pending_approval',
    approved_by: autoApprove ? ctx.user.id : null,
    approved_at: autoApprove ? new Date().toISOString() : null,
    metadata: { connector: SOCIAL_CONNECTORS[draft.platform], generatedBy: 'backend' },
  }))).select('*')

  if (postError) return NextResponse.json({ ok: false, error: postError.message, campaign }, { status: 500 })

  await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.campaign.create', targetType: 'outreach_social_campaigns', targetId: campaign.id, metadata: { platforms, postCount: posts?.length || 0, autoApprove } })

  return NextResponse.json({ ok: true, campaign, posts: posts || [] })
}
