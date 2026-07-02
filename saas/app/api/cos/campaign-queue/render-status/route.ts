// saas/app/api/cos/campaign-queue/render-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { fetchSiteVideo } from '@/lib/operator/video'
import { renderBrandedVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function buildFinal(ctx: any, campaign: any, video: any, lang: string) {
  const aspect: '9:16' | '16:9' = video?.aspect === '9:16' || video?.aspect === '16:9'
    ? video.aspect
    : (campaign.channel === 'short_video' ? '9:16' : '16:9')
  const readyCampaign = { ...campaign, metadata: { ...(campaign.metadata || {}), video: { ...video, status: 'ready' } } }
  const b = await renderBrandedVideo({ campaign: readyCampaign, brollUrl: video.url, aspect, lang })
  const doneIso = new Date().toISOString()

  if (b.ok && b.url) {
    const updatedVideo = {
      ...video,
      status: 'ready',
      voicedUrl: b.url,
      branded: true,
      brandSchemaVersion: BRAND_SCHEMA_VERSION,
      brandText: BRAND_TEXT,
      brandedAt: doneIso,
      voiced: { ...((video && video.voiced) || {}), [lang]: b.url },
      voiceError: null,
      brandDebug: b.debug || null,
    }
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: updatedVideo } }).eq('id', campaign.id)
    return updatedVideo
  }

  // No fallback here. The old fallback created an unbranded/caption-only video and
  // saved it as voicedUrl, which made bad output look like the final COSA result.
  // A final campaign video is only final when JSON2Video returns the branded asset.
  const updatedVideo = {
    ...video,
    status: 'ready',
    voicedUrl: null,
    branded: false,
    brandSchemaVersion: null,
    brandText: null,
    brandedAt: null,
    voiced: (video && video.voiced) || {},
    voiceError: `branded compose failed: ${b.error || 'unknown'}`,
    brandDebug: b.debug || null,
  }
  await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: updatedVideo } }).eq('id', campaign.id)
  return updatedVideo
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
    return NextResponse.json({ ok: true, status: 'ready', url: v.voicedUrl, baseUrl: v.url, branded: true, brandSchemaVersion: v.brandSchemaVersion })
  }
  if (v.status === 'ready' && v.url) {
    const finalVideo = await buildFinal(ctx, campaign, v, lang)
    return NextResponse.json({ ok: finalVideo.branded === true, status: 'ready', url: finalVideo.voicedUrl || null, baseUrl: finalVideo.url, branded: finalVideo.branded === true, brandSchemaVersion: finalVideo.brandSchemaVersion || null, warning: finalVideo.voiceError || null }, { status: finalVideo.branded === true ? 200 : 502 })
  }

  let res: any
  try { res = await fetchSiteVideo(v.requestId, v.model) } catch (e: any) { res = { status: 'failed', error: e?.message } }
  const now = new Date().toISOString()

  if (res?.status === 'done' && res.videoUrl) {
    const baseVideo = { ...v, status: 'ready', url: res.videoUrl, ready_at: now }
    const finalVideo = await buildFinal(ctx, campaign, baseVideo, lang)
    return NextResponse.json({ ok: finalVideo.branded === true, status: 'ready', url: finalVideo.voicedUrl || null, baseUrl: res.videoUrl, branded: finalVideo.branded === true, brandSchemaVersion: finalVideo.brandSchemaVersion || null, warning: finalVideo.voiceError || null }, { status: finalVideo.branded === true ? 200 : 502 })
  }
  if (res?.status === 'failed' || res?.ok === false) {
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: res?.error || 'render failed', failed_at: now } } }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'failed', error: res?.error || 'render failed' })
  }

  return NextResponse.json({ ok: true, status: 'rendering' })
}
