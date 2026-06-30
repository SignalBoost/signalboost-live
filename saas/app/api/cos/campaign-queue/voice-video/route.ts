// saas/app/api/cos/campaign-queue/voice-video/route.ts
// Owner-triggered: take a campaign's ready (Kling) video and add spoken voiceover
// of the script via ElevenLabs + fal merge. Writes the voiced URL back to the
// campaign. Publishing still gated and will prefer the voiced video.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'

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

  const r = await addVoiceToCampaignVideo(campaign, lang)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'voice compose failed' }, { status: 502 })

  const v = campaign.metadata.video
  const voiced = { ...((v && v.voiced) || {}), [lang]: r.url }
  await ctx.admin.from('cos_campaign_queue').update({
    metadata: { ...(campaign.metadata || {}), video: { ...v, voiced, voicedUrl: r.url } },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.voice_video',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { language: lang },
  })

  return NextResponse.json({ ok: true, url: r.url, language: lang })
}
