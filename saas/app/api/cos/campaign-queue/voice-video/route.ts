// saas/app/api/cos/campaign-queue/voice-video/route.ts
// Owner-gated managed voice pass for COS campaign videos. It creates narration
// with ElevenLabs and starts a fal.ai compose job against the latest approved
// campaign render; status is stored in campaign metadata for review.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { startManagedVoiceVideo } from '@/lib/cos/video-voice'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || body?.campaign_id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'campaign_id is required' }, { status: 400 })

  const { data: campaign, error } = await ctx.admin.from('cos_campaign_queue').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: error?.message || 'Campaign not found' }, { status: 404 })

  const language = body?.language ? String(body.language) : undefined
  const started = await startManagedVoiceVideo({
    campaign,
    language,
    videoUrl: body?.videoUrl ? String(body.videoUrl) : undefined,
    voiceId: body?.voiceId ? String(body.voiceId) : undefined,
    narration: body?.narration ? String(body.narration) : undefined,
  })
  if (!started.ok) return NextResponse.json({ ok: false, error: (started as { ok: false; error: string }).error }, { status: 502 })

  const startedAt = new Date().toISOString()
  const metadata = {
    ...(campaign.metadata || {}),
    voiceVideo: {
      status: 'rendering',
      requestId: started.requestId,
      model: started.model,
      voiceId: started.voiceId,
      language: language || null,
      started_at: startedAt,
    },
  }
  await ctx.admin.from('cos_campaign_queue').update({ metadata }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.voice_video_started',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { requestId: started.requestId, language: language || null, voiceId: started.voiceId },
  })

  return NextResponse.json({ ok: true, status: 'rendering', requestId: started.requestId })
}
