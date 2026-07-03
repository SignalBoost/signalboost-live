// saas/app/api/cos/campaign-queue/backfill-video-renders/route.ts
// Admin repair endpoint: starts missing base video renders for recent COSA
// video campaigns that are already in the queue but still show only a
// "Render video" button because metadata.video was never created.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { startSiteVideo } from '@/lib/operator/video'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const VIDEO_CHANNELS = ['youtube', 'short_video']
const DEFAULT_SINCE = '2026-06-30T00:00:00Z'
const MAX_PER_RUN = 5

function cleanTheme(campaign: any): string {
  const raw = String(campaign.title || campaign.objective || 'AI-powered business growth platform')
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w-]+\.(?:com|app|io|net|org|ai|co)\b/gi, ' ')
    .replace(/\b(must|should|do not|don't|caption|captions|subtitle|subtitles|on screen|on-screen|display|url|link|text)\b/gi, ' ')
    .replace(/["“”'’:;.\-•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function promptFor(campaign: any): string {
  const theme = cleanTheme(campaign)
  return `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals using sleek software dashboards, growth charts rising, AI automation and workflows, clean bright modern offices, confident entrepreneurs. Premium, optimistic, high-end tech commercial look, smooth cinematic camera motion. Absolutely no on-screen text, no words, no letters, no captions, no subtitles, no logos, no watermarks, no URLs, no signage.`.slice(0, 700)
}

function needsRender(campaign: any): boolean {
  const video = campaign.metadata?.video
  if (!VIDEO_CHANNELS.includes(String(campaign.channel))) return false
  if (video?.status || video?.url || video?.requestId) return false
  return true
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const since = String(body?.since || DEFAULT_SINCE)
  const max = Math.max(1, Math.min(MAX_PER_RUN, Number(body?.limit || MAX_PER_RUN)))

  const { data: campaigns, error } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .in('status', ['waiting_approval', 'approved', 'queued'])
    .in('channel', VIDEO_CHANNELS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: any[] = []
  let startedCount = 0

  for (const campaign of campaigns || []) {
    if (startedCount >= max) break
    if (!needsRender(campaign)) continue

    const aspect: '9:16' | '16:9' = campaign.channel === 'short_video' ? '9:16' : '16:9'
    const prompt = promptFor(campaign)
    const started: any = await startSiteVideo(prompt, aspect)
    const now = new Date().toISOString()
    const video = started.ok ? {
      status: 'rendering',
      requestId: started.requestId,
      model: started.model,
      aspect,
      prompt,
      started_at: now,
      url: null,
      voicedUrl: null,
      voiced: {},
      branded: false,
      brandedLangs: {},
      unbrandedVoiced: {},
      brandSchemaVersion: null,
      brandText: null,
      brandedAt: null,
      voiceError: null,
      brandAttempts: {},
      ghOverlayAttempts: {},
      brandingLock: null,
    } : {
      status: 'failed',
      error: started.error || 'Could not start draft video render.',
      failed_at: now,
      voicedUrl: null,
      voiced: {},
      branded: false,
    }

    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video },
    }).eq('id', campaign.id)

    await auditAdminAction({
      admin: ctx.admin,
      actorId: ctx.user.id,
      action: 'cos_campaign.backfill_video_render',
      targetType: 'cos_campaign_queue',
      targetId: campaign.id,
      metadata: { ok: Boolean(started.ok), requestId: started.requestId || null, model: started.model || null, aspect, error: started.error || null },
    })

    startedCount++
    results.push({ campaign: campaign.id, title: campaign.title, ok: Boolean(started.ok), requestId: started.requestId || null, error: started.error || null })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, started: startedCount, results })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
