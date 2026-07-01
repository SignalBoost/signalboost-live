// saas/app/api/cos/campaign-queue/render-video/route.ts
// Start an actual promo video render (fal.ai / Kling) for a video campaign and
// store the render handle on the campaign. A poll cron (cos-video-poll) advances
// it to a ready URL. Publishing stays owner-gated and uses the rendered URL.
//
// IMPORTANT: text-to-video models cannot spell, so any words/URLs in the prompt
// come out as garbled on-screen text. We therefore strip URLs and on-screen-text
// instructions from the theme and explicitly ask for clean, text-free footage.
// The URL and captions are added later (spoken voiceover + burned captions in the
// voice step), never baked into the Kling render.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { startSiteVideo } from '@/lib/operator/video'

export const dynamic = 'force-dynamic'

const VIDEO_CHANNELS = ['youtube', 'short_video']

// Pull a short, clean visual theme out of the campaign — no URLs, no directive
// language ("must display", "caption", etc.), no leftover punctuation.
function cleanTheme(campaign: any): string {
  const raw = String(campaign.title || campaign.objective || 'an AI platform that helps businesses grow')
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')                 // full URLs
    .replace(/\b[\w-]+\.(?:com|app|io|net|org|ai|co)\b/gi, ' ') // bare domains
    .replace(/\b(must|should|do not|don't|caption|captions|subtitle|subtitles|on screen|on-screen|display|url|link|text)\b/gi, ' ')
    .replace(/["“”'’:;.\-•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
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

  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) {
    return NextResponse.json({ ok: false, error: `Channel "${campaign.channel}" is not a video channel.` }, { status: 400 })
  }

  const aspect: '9:16' | '16:9' = campaign.channel === 'short_video' ? '9:16' : '16:9'
  const theme = cleanTheme(campaign)
  const themedPrompt = `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals using sleek software dashboards, growth charts rising, AI automation and workflows, clean bright modern offices, confident entrepreneurs. Premium, optimistic, high-end tech commercial look, smooth cinematic camera motion. Absolutely no on-screen text, no words, no letters, no captions, no subtitles, no logos, no watermarks, no URLs, no signage.`.slice(0, 600)
  const prompt = String(body?.prompt || themedPrompt)

  const started: any = await startSiteVideo(prompt, aspect)
  if (!started.ok) return NextResponse.json({ ok: false, error: started.error || 'Could not start render.' }, { status: 502 })

  const startedAt = new Date().toISOString()
  await ctx.admin.from('cos_campaign_queue').update({
    metadata: {
      ...(campaign.metadata || {}),
      video: {
        status: 'rendering',
        requestId: started.requestId,
        model: started.model,
        aspect,
        prompt,
        started_at: startedAt,
        voicedUrl: null,
        voiced: {},
        branded: false,
        brandSchemaVersion: null,
        brandText: null,
        brandedAt: null,
        voiceError: null,
        brandAttempts: {},
        brandingLock: null,
      },
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
