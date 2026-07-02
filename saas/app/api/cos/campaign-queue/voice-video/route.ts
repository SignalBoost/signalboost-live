import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
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

  const v = campaign.metadata?.video
  if (v?.status !== 'ready' || !v?.url) {
    return NextResponse.json({ ok: false, error: 'Render a video first; no ready video found.' }, { status: 400 })
  }

  const aspect: '9:16' | '16:9' = v.aspect === '9:16' || v.aspect === '16:9'
    ? v.aspect
    : (campaign.channel === 'short_video' ? '9:16' : '16:9')

  const speech = await addVoiceToCampaignVideo(campaign, lang)
  if (!speech.ok || !speech.url) {
    const msg = `voice compose failed: ${speech.error || 'unknown'}`
    await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, voicedUrl: null, branded: false, voiceError: msg } } }).eq('id', id)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  const overlay = await renderBrandOverlayVideo({ campaign, sourceUrl: speech.url, aspect, lang })
  const doneIso = new Date().toISOString()
  const finalUrl = overlay.ok && overlay.url ? overlay.url : speech.url
  const isBranded = overlay.ok && !!overlay.url
  const updatedVideo = {
    ...v,
    voiced: { ...((v && v.voiced) || {}), [lang]: finalUrl },
    voicedUrl: finalUrl,
    branded: isBranded,
    brandSchemaVersion: isBranded ? BRAND_SCHEMA_VERSION : null,
    brandText: isBranded ? BRAND_TEXT : null,
    brandedAt: isBranded ? doneIso : null,
    voiceError: isBranded ? null : `brand overlay failed: ${overlay.error || 'unknown'}`,
    brandDebug: overlay.debug || null,
    unbrandedVoicedUrl: isBranded ? null : speech.url,
  }
  await ctx.admin.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: updatedVideo } }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.voice_video',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { language: lang, branded: isBranded },
  })

  return NextResponse.json({ ok: true, url: finalUrl, language: lang, branded: isBranded, warning: isBranded ? null : updatedVideo.voiceError })
}
