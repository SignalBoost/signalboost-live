// saas/app/api/cos/campaign-queue/render-video/route.ts
// Start a promo video render for a video campaign. Produces a 15s clip made of
// THREE distinct cinematic shots via fal multi_prompt (instead of one 5s clip),
// so the footage has variety before the voice/caption step stretches it to >=60s.
//
// The job stays a SINGLE fal request (one requestId), so the existing poll cron
// (cos-video-poll) and render-status button advance it unchanged — they just read
// data.video.url like before. If multi_prompt ever errors, we fall back to a safe
// single-prompt 10s render so a campaign never gets stuck.
//
// IMPORTANT: text-to-video models cannot spell, so any words/URLs in the prompt
// come out garbled on-screen. We strip URLs/on-screen-text instructions from the
// theme and explicitly forbid text in the footage. The URL + captions are added
// later (spoken voiceover + burned captions in the voice step), never baked in.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { fal } from '@fal-ai/client'

export const dynamic = 'force-dynamic'

const VIDEO_CHANNELS = ['youtube', 'short_video']
const VIDEO_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}

// Pull a short, clean visual theme out of the campaign — no URLs, no directive
// language ("must display", "caption", etc.), no leftover punctuation.
function cleanTheme(campaign: any): string {
  const raw = String(campaign.title || campaign.objective || 'an AI platform that helps businesses grow')
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w-]+\.(?:com|app|io|net|org|ai|co)\b/gi, ' ')
    .replace(/\b(must|should|do not|don't|caption|captions|subtitle|subtitles|on screen|on-screen|display|url|link|text)\b/gi, ' ')
    .replace(/["“”'’:;.\-•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

const NO_TEXT = 'text, letters, words, captions, subtitles, logos, watermarks, signage, blur, distortion, low quality, deformed'

// Three distinct shots that share the campaign theme. Sums to 15s (3 x 5s).
function shotsFor(theme: string) {
  return [
    { prompt: `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals in a bright modern office using sleek software dashboards, rising growth charts on large screens. Confident, optimistic, high-end tech commercial look, smooth cinematic dolly-in. No on-screen text.`.slice(0, 600), duration: '5' as const },
    { prompt: `Cinematic close-up of futuristic AI automation and workflow interfaces, glowing data visualizations and analytics flowing across elegant screens in a premium studio. Clean, high-end technology aesthetic, smooth camera motion. No on-screen text.`.slice(0, 600), duration: '5' as const },
    { prompt: `Cinematic shot of a confident entrepreneur reviewing business analytics on a laptop, a bright city skyline through floor-to-ceiling glass behind them. Successful, aspirational, warm natural light, gentle camera push-in. No on-screen text.`.slice(0, 600), duration: '5' as const },
  ]
}

function singlePrompt(theme: string) {
  return `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals using sleek software dashboards, growth charts rising, AI automation and workflows, clean bright modern offices, confident entrepreneurs. Premium, optimistic, high-end tech commercial look, smooth cinematic camera motion. Absolutely no on-screen text, no words, no letters, no captions, no logos, no watermarks, no URLs.`.slice(0, 600)
}

async function submitRender(theme: string, aspect: '9:16' | '16:9') {
  ensureFal()
  // Preferred: 3 distinct shots in one job (15s of varied footage).
  try {
    const submitted: any = await fal.queue.submit(VIDEO_MODEL, {
      input: {
        multi_prompt: shotsFor(theme),
        shot_type: 'customize',
        aspect_ratio: aspect,
        generate_audio: false,
        negative_prompt: NO_TEXT,
        cfg_scale: 0.5,
      },
    })
    const requestId = submitted?.request_id
    if (requestId) return { ok: true as const, requestId, model: VIDEO_MODEL, mode: 'multi_shot' }
  } catch (e: any) {
    console.error('multi_prompt render submit failed, falling back:', e?.message)
  }
  // Fallback: safe single-prompt 10s render so a campaign is never stuck.
  try {
    const submitted: any = await fal.queue.submit(VIDEO_MODEL, {
      input: {
        prompt: singlePrompt(theme),
        duration: '10',
        aspect_ratio: aspect,
        generate_audio: false,
        negative_prompt: NO_TEXT,
      },
    })
    const requestId = submitted?.request_id
    if (requestId) return { ok: true as const, requestId, model: VIDEO_MODEL, mode: 'single_shot' }
    return { ok: false as const, error: 'No request id returned from fal.' }
  } catch (e: any) {
    return { ok: false as const, error: e?.message || 'Could not start render.' }
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

  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) {
    return NextResponse.json({ ok: false, error: `Channel "${campaign.channel}" is not a video channel.` }, { status: 400 })
  }

  const aspect: '9:16' | '16:9' = campaign.channel === 'short_video' ? '9:16' : '16:9'
  const theme = cleanTheme(campaign)

  const started = await submitRender(theme, aspect)
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
        mode: started.mode,
        theme,
        started_at: startedAt,
      },
    },
  }).eq('id', id)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.render_video_started',
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { channel: campaign.channel, aspect, requestId: started.requestId, mode: started.mode },
  })

  return NextResponse.json({ ok: true, status: 'rendering', requestId: started.requestId, mode: started.mode })
}
