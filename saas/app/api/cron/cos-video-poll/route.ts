// saas/app/api/cron/cos-video-poll/route.ts
// Polls in-flight campaign video renders (metadata.video.status = 'rendering')
// and writes the finished URL back, or marks failed. CRON_SECRET-gated like the
// other crons. Pairs with /api/cos/campaign-queue/render-video.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchSiteVideo } from '@/lib/operator/video'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const { data: pending } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .filter('metadata->video->>status', 'eq', 'rendering')
    .limit(20)

  let advanced = 0
  for (const campaign of pending || []) {
    const v = (campaign.metadata && campaign.metadata.video) || {}
    if (!v.requestId || !v.model) continue

    let res: any
    try { res = await fetchSiteVideo(v.requestId, v.model) } catch (e: any) { res = { status: 'failed', error: e?.message } }

    const now = new Date().toISOString()
    if (res?.status === 'done' && res.videoUrl) {
      await sb.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'ready', url: res.videoUrl, ready_at: now } },
      }).eq('id', campaign.id)
      advanced++
    } else if (res?.status === 'failed' || res?.ok === false) {
      await sb.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: res?.error || 'render failed', failed_at: now } },
      }).eq('id', campaign.id)
      advanced++
    }
    // else: still rendering — leave untouched for the next poll.
  }

  return NextResponse.json({ ok: true, advanced })
}
