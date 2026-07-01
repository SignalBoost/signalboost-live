// saas/app/api/cos/campaign-queue/render-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { fetchSiteVideo } from '@/lib/operator/video'
import { renderBrandedVideo } from '@/lib/cos/video-compose'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function buildFinal(ctx: any, campaign: any, video: any, lang: string) {
  const aspect: '9:16' | '16:9' = video?.aspect === '9:16' || video?.aspect === '16:9'
    ? video.aspect
    : (campaign.channel === 'short_video' ? '9:16' : '16:9')
  const readyCampaign = { ...campaign, metadata: { ...(campaign.metadata || {}), video: { ...video, status: 'ready' } } }
  let finalUrl = ''
  let branded = false
  let voiceError = ''
  const b = await renderBrandedVideo({ campaign: readyCampaign, brollUrl: video.url, aspect, lang })
  if (b.ok && b.url) {
    finalUrl = b.url
    branded = true
  } else {
    const r = await addVoiceToCampaignVideo(readyCampaign, lang)
    if (r.ok && r.url) {
      finalUrl = r.url
      voiceError = b.error ? `branded compose failed: ${b.error}` : ''
    } else {
      voiceError = `branded compose failed: ${b.error || 'unknown'} | fallback failed: ${r.error || 'unknown'}`
    }
  }
  const updatedVideo = { ...video, status: 'ready', voicedUrl: finalUrl || video.voicedUrl || null, branded, voiceError: voiceError || null }
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
  if (v.status === 'ready' && v.voicedUrl && v.branded === true) return NextResponse.json({ ok: true, status: 'ready', url: v.voicedUrl, baseUrl: v.url, branded: true })
  if (v.status === 'ready' && v.url) {
    const finalVideo = await buildFinal(ctx, campaign, v, lang)
    return NextResponse.json({ ok: true, status: 'ready', url: finalVideo.voicedUrl || finalVideo.url, baseUrl: finalVideo.url, branded: finalVideo.branded === true, warning: finalVideo.voiceError || null })
  }

  let res: any
  try { res = await fetchSiteVideo(v.requestId, v.model) } catch (e: any) { res = { status: 'failed', error: e?.message } }
  const now = new Date().toISOString()

  if (res?.status === 'done' && res.videoUrl) {
    const baseVideo = { ...v, status: 'ready', url: res.videoUrl, ready_at: now }
    const finalVideo = await buildFinal(ctx, campaign, baseVideo, lang)
    return NextResponse.json({ ok: true, status: 'ready', url: finalVideo.voicedUrl || res.videoUrl, baseUrl: res.videoUrl, branded: finalVideo.branded === true, warning: finalVideo.voiceError || null })
  }
  if (res?.status === 'failed' || res?.ok === false) {
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: res?.error || 'render failed', failed_at: now } } }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'failed', error: res?.error || 'render failed' })
  }

  return NextResponse.json({ ok: true, status: 'rendering' })
}
