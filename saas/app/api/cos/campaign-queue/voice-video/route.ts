// saas/app/api/cos/campaign-queue/voice-video/route.ts
// Owner-triggered "Add voice" for a campaign's ready (Kling) video.
//
// NEW: first tries a BRANDED assembly via JSON2Video — b-roll looped to ~60s +
// ElevenLabs voiceover + auto captions + EXACT on-screen "SignalBoostAi" (gold)
// and "www.saas.signalboostapp.com" (cyan) in the first and last seconds.
// If that fails for any reason, it FALLS BACK to the existing fal voice/caption
// path, so behavior is never worse than before. The result URL is stored the
// same way either way, so the card renders it unchanged.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandedVideo } from '@/lib/cos/video-compose'

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

  // 1) Preferred path: branded compose with exact on-screen text.
  let url = ''
  let branded = false
  let brandErr = ''
  const b = await renderBrandedVideo({ campaign, brollUrl: v.url, aspect, lang })
  if (b.ok && b.url) {
    url = b.url
    branded = true
  } else {
    brandErr = b.error || 'branded compose failed'
    // 2) Fallback: existing fal voice/caption path (never worse than before).
    const r = await addVoiceToCampaignVideo(campaign, lang)
    if (r.ok && r.url) {
      url = r.url
    } else {
      // Both failed — persist the error on the card and stop.
      const combined = `branded: ${brandErr} | fallback: ${r.error || 'voice compose failed'}`
      await ctx.admin.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: { ...v, voiceError: combined } },
      }).eq('id', id)
      return NextResponse.json({ ok: false, error: combined }, { status: 502 })
    }
  }

  const voiced = { ...((v && v.voiced) || {}), [lang]: url }
  await ctx.admin.from('cos_campaign_queue').update({
    metadata: { ...(campaign.metadata || {}), video: { ...v, voiced, voicedUrl: url, branded, voiceError: null } },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.voice_video',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { language: lang, mode: branded ? 'branded' : 'fal_fallback', brandError: branded ? null : brandErr },
  })

  return NextResponse.json({ ok: true, url, language: lang, branded })
}
