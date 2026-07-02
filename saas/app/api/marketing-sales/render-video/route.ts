import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { queueVideoProductionJob } from '@/lib/cos/video-production'
import type { VideoProductionInput } from '@/lib/cos/video-production'

export const dynamic = 'force-dynamic'

type RenderVideoBody = VideoProductionInput & {
  queue_immediately?: boolean
  concept_approved?: boolean
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: RenderVideoBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await queueVideoProductionJob({
    title: body.title || 'SignalBoostAi promotional video',
    hook: body.hook || 'Promote saas.signalboostapp.com with a premium SaaS video.',
    audience: body.audience || 'small businesses, agencies, hotels, restaurants, and entrepreneurs',
    destination_url: body.destination_url || 'www.saas.signalboostapp.com',
    url_text: body.url_text || 'www.saas.signalboostapp.com',
    brand_text: body.brand_text || 'SignalBoostAi',
    voiceover: body.voiceover,
    captions: body.captions || body.voiceover,
    format: body.format || 'youtube',
    duration_seconds: body.duration_seconds || 60,
    production_tier: body.production_tier || 'professional',
    platforms: body.platforms,
  }, {
    queueImmediately: body.queue_immediately !== false,
    conceptApproved: body.concept_approved !== false,
  })

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      persisted: result.persisted,
      status: result.status,
      error: result.error || result.warning || 'Video render job could not be queued.',
      job: result.job,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    persisted: result.persisted,
    status: result.status,
    videoJobId: result.id,
    job: result.job,
    message: 'Video render job queued. Rendering and publishing still require owner approval gates.',
  })
}
