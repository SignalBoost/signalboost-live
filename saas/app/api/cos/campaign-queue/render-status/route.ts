// saas/app/api/cos/campaign-queue/render-status/route.ts
// Poll a COS campaign's base video render and update metadata.video.status.
//
// IMPORTANT: this route must NOT run voice/caption/brand composition inline.
// The final pipeline is intentionally split:
//   1. render-video starts the base Kling/fal render.
//   2. cos-video-poll or this route advances the base render to metadata.video.url.
//   3. cos-brand-video creates voiced/captioned unbranded videos.
//   4. GitHub Actions FFmpeg worker burns in SignalBoostAi + URL and writes voicedUrl.
//
// Keeping this route lightweight prevents the dashboard Check Status button from
// timing out, consuming overlay credits, or blocking base render completion.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { fetchSiteVideo } from '@/lib/operator/video'
import { BRAND_SCHEMA_VERSION } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function readyPayload(video: any) {
  const branded = video?.branded === true && Boolean(video?.voicedUrl) && Number(video?.brandSchemaVersion || 0) >= BRAND_SCHEMA_VERSION
  return {
    ok: true,
    status: 'ready',
    url: branded ? video.voicedUrl : null,
    baseUrl: video?.url || null,
    branded,
    brandSchemaVersion: video?.brandSchemaVersion || null,
    warning: branded ? null : 'Base video render is ready. Voice, captions, and FFmpeg brand banner are still being processed.',
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || body?.campaign_id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  const v = (campaign.metadata && campaign.metadata.video) || null
  if (!v || !v.requestId || !v.model) {
    return NextResponse.json({ ok: false, error: 'No render in progress for this campaign.' }, { status: 400 })
  }

  if (v.status === 'ready' && v.url) {
    return NextResponse.json(readyPayload(v))
  }

  if (v.status === 'failed') {
    return NextResponse.json({ ok: true, status: 'failed', error: v.error || 'render failed', baseUrl: v.url || null, branded: false })
  }

  let res: any
  try {
    res = await fetchSiteVideo(v.requestId, v.model)
  } catch (e: any) {
    res = { status: 'rendering', warning: e?.message || 'status check failed' }
  }

  const now = new Date().toISOString()

  if (res?.status === 'done' && res.videoUrl) {
    const updatedVideo = {
      ...v,
      status: 'ready',
      url: res.videoUrl,
      ready_at: now,
      // Branded final URLs are owned by the FFmpeg worker only. Do not put an
      // unbranded URL in voicedUrl here.
      voicedUrl: v.branded === true ? v.voicedUrl || null : null,
      voiced: v.voiced || {},
      branded: v.branded === true,
      brandedLangs: v.brandedLangs || {},
      unbrandedVoiced: v.unbrandedVoiced || {},
      brandingLock: null,
    }
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: updatedVideo },
    }).eq('id', campaign.id)
    return NextResponse.json(readyPayload(updatedVideo))
  }

  if (res?.status === 'failed' || res?.ok === false) {
    const updatedVideo = {
      ...v,
      status: 'failed',
      error: res?.error || 'render failed',
      failed_at: now,
      brandingLock: null,
    }
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: updatedVideo },
    }).eq('id', campaign.id)
    return NextResponse.json({ ok: true, status: 'failed', error: updatedVideo.error, branded: false })
  }

  return NextResponse.json({ ok: true, status: 'rendering', warning: res?.warning || null })
}
