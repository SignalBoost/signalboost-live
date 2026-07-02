// saas/app/api/cos/campaign-queue/voice-video/route.ts
// Owner-triggered final branded video assembly for a campaign's ready video.
// This route no longer falls back to an unbranded fal voice/caption render. A
// COSA campaign video is final only when JSON2Video returns the branded asset
// with the SignalBoostAi + www.saas.signalboostapp.com overlay burned in.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { renderBrandedVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

  if (campaign?.metadata?.video?.status !== 'ready' || !campaign?.metadata?.video?.url) {
    return NextResponse.json({ ok: false, error: 'Render a video first; no ready video found.' }, { status: 400 })
  }

  const v = campaign.metadata.video
  const aspect: '9:16' | '16:9' = v?.aspect === '9:16' || v?.aspect === '16:9'
    ? v.aspect
    : (campaign.channel === 'short_video' ? '9:16' : '16:9')

  const b = await renderBrandedVideo({ campaign, brollUrl: v.url, aspect, lang })
  if (!b.ok || !b.url) {
    const errorText = `branded compose failed: ${b.error || 'branded compose failed'}`
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: {
        ...(campaign.metadata || {}),
        video: {
          ...v,
          voicedUrl: null,
          branded: false,
          brandSchemaVersion: null,
          brandText: null,
          brandedAt: null,
          voiceError: errorText,
          brandDebug: b.debug || null,
        },
      },
    }).eq('id', id)

    await auditAdminAction({
      admin: ctx.admin,
      actorId: ctx.user.id,
      action: 'cos_campaign.voice_video_failed',
      targetType: 'cos_campaign_queue',
      targetId: id,
      metadata: { language: lang, mode: 'branded_required', brandError: errorText, brandDebug: b.debug || null },
    })

    return NextResponse.json({ ok: false, error: errorText, debug: b.debug || null }, { status: 502 })
  }

  const voiced = { ...((v && v.voiced) || {}), [lang]: b.url }
  const doneIso = new Date().toISOString()
  const updatedVideo = {
    ...v,
    voiced,
    voicedUrl: b.url,
    branded: true,
    brandSchemaVersion: BRAND_SCHEMA_VERSION,
    brandText: BRAND_TEXT,
    brandedAt: doneIso,
    voiceError: null,
    brandDebug: b.debug || null,
  }
  await ctx.admin.from('cos_campaign_queue').update({
    metadata: { ...(campaign.metadata || {}), video: updatedVideo },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.voice_video',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { language: lang, mode: 'branded', brandError: null, brandDebug: b.debug || null },
  })

  return NextResponse.json({ ok: true, url: b.url, language: lang, branded: true, brandSchemaVersion: BRAND_SCHEMA_VERSION })
}
