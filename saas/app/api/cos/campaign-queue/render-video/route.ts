// saas/app/api/cos/campaign-queue/render-video/route.ts
// Start an actual promo video render (fal.ai / Kling) for a video campaign and
// store the render handle on the campaign. A poll cron (cos-video-poll) advances
// it to a ready URL. Publishing stays owner-gated and uses the rendered URL.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { startSiteVideo, buildSiteVideoPrompt } from '@/lib/operator/video'

export const dynamic = 'force-dynamic'

const VIDEO_CHANNELS = ['youtube', 'short_video']

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || body?.campaign_id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) {
    return NextResponse.json({ ok: false, error: `Channel "${campaign.channel}" is not a video channel.` }, { status: 400 })
  }

  const aspect: '9:16' | '16:9' = campaign.channel === 'short_video' ? '9:16' : '16:9'
  const prompt = String(body?.prompt || buildSiteVideoPrompt({
    businessName: 'SignalBoost',
    description: String(campaign.objective || campaign.title || 'an AI business operations platform'),
  }))

  const started: any = await startSiteVideo(prompt, aspect)
  if (!started.ok) return NextResponse.json({ ok: false, error: started.error || 'Could not start render.' }, { status: 502 })

  const startedAt = new Date().toISOString()
  await ctx.admin.from('cos_campaign_queue').update({
    metadata: {
      ...(campaign.metadata || {}),
      video: { status: 'rendering', requestId: started.requestId, model: started.model, aspect, prompt, started_at: startedAt },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.render_video_started',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { channel: campaign.channel, aspect, requestId: started.requestId },
  })

  return NextResponse.json({ ok: true, status: 'rendering', requestId: started.requestId })
}
