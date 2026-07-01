// saas/app/api/cos/campaign-queue/render-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { fetchSiteVideo } from '@/lib/operator/video'
import { renderBrandedVideo } from '@/lib/cos/video-compose'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BRAND_SCHEMA_VERSION = 4

async function buildFinal(ctx: any, campaign: any, video: any, lang: string): Promise<{ ok: boolean; video: any; error?: string }> {
  const aspect: '9:16' | '16:9' = video?.aspect === '9:16' || video?.aspect === '16:9'
    ? video.aspect
    : (campaign.channel === 'short_video' ? '9:16' : '16:9')
  const readyCampaign = { ...campaign, metadata: { ...(campaign.metadata || {}), video: { ...video, status: 'ready' } } }
  const b = await renderBrandedVideo({ campaign: readyCampaign, brollUrl: video.url, aspect, lang })

  if (!b.ok || !b.url) {
    const voiceError = b.error || 'JSON2Video branded compose failed'
    const failedVideo = {
      ...video,
      status: 'ready',
      branded: false,
      brandSchemaVersion: video.brandSchemaVersion || null,
      brandText: video.brandText || null,
      voiceError,
    }
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: failedVideo } }).eq('id', campaign.id)
    return { ok: false, video: failedVideo, error: voiceError }
  }

  const updatedVideo = {
    ...video,
    status: 'ready',
    voicedUrl: b.url,
    branded: true,
    brandSchemaVersion: BRAND_SCHEMA_VERSION,
    brandText: { name: 'SignalBoostAi', url: 'www.saas.signalboostapp.com' },
    voiceError: null,
  }
  await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: updatedVideo } }).eq('id', campaign.id)
  return { ok: true, video: updatedVideo }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || body?.campaign_id || '').trim()
  const lang = String(body?.language || 'en').trim() || 'en'
  if (!id) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  const v = (campaign.metadata && campaign.metadata.video) || null
  if (!v || !v.requestId || !v.model) return NextResponse.json({ ok: false, error: 'No render in progress for this campaign.' }, { status: 400 })
  if (v.status === 'ready' && v.voicedUrl && v.branded === true && Number(v.brandSchemaVersion || 0) >= BRAND_SCHEMA_VERSION) {
    return NextResponse.json({ ok: true, status: 'ready', url: v.voicedUrl, baseUrl: v.url, branded: true, brandSchemaVersion: BRAND_SCHEMA_VERSION })
  }
  if (v.status === 'ready' && v.url) {
    const final = await buildFinal(ctx, campaign, v, lang)
    if (!final.ok) return NextResponse.json({ ok: false, status: 'ready', baseUrl: v.url, branded: false, brandSchemaVersion: BRAND_SCHEMA_VERSION, error: final.error }, { status: 502 })
    const finalVideo = final.video
    return NextResponse.json({ ok: true, status: 'ready', url: finalVideo.voicedUrl, baseUrl: finalVideo.url, branded: true, brandSchemaVersion: BRAND_SCHEMA_VERSION, warning: null })
  }

  let res: any
  try { res = await fetchSiteVideo(v.requestId, v.model) } catch (e: any) { res = { status: 'failed', error: e?.message } }
  const now = new Date().toISOString()

  if (res?.status === 'done' && res.videoUrl) {
    const baseVideo = { ...v, status: 'ready', url: res.videoUrl, ready_at: now }
    const final = await buildFinal(ctx, campaign, baseVideo, lang)
    if (!final.ok) return NextResponse.json({ ok: false, status: 'ready', baseUrl: res.videoUrl, branded: false, brandSchemaVersion: BRAND_SCHEMA_VERSION, error: final.error }, { status: 502 })
    const finalVideo = final.video
    return NextResponse.json({ ok: true, status: 'ready', url: finalVideo.voicedUrl, baseUrl: res.videoUrl, branded: true, brandSchemaVersion: BRAND_SCHEMA_VERSION, warning: null })
  }
  if (res?.status === 'failed' || res?.ok === false) {
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: res?.error || 'render failed', failed_at: now } } }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'failed', error: res?.error || 'render failed' })
  }

  return NextResponse.json({ ok: true, status: 'rendering' })
}
