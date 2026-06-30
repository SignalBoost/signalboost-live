// saas/app/api/cos/campaign-queue/render-status/route.ts
// Owner-triggered poll of ONE campaign's video render. Mirrors the cron logic but
// lets the owner force a status check from the cockpit without waiting for the
// cron — so a finished render appears on demand, and a failed one shows its error.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { fetchSiteVideo } from '@/lib/operator/video'

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

  const v = (campaign.metadata && campaign.metadata.video) || null
  if (!v || !v.requestId || !v.model) {
    return NextResponse.json({ ok: false, error: 'No render in progress for this campaign.' }, { status: 400 })
  }
  if (v.status === 'ready' && v.url) {
    return NextResponse.json({ ok: true, status: 'ready', url: v.url })
  }

  let res: any
  try { res = await fetchSiteVideo(v.requestId, v.model) } catch (e: any) { res = { status: 'failed', error: e?.message } }
  const now = new Date().toISOString()

  if (res?.status === 'done' && res.videoUrl) {
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'ready', url: res.videoUrl, ready_at: now } },
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'ready', url: res.videoUrl })
  }
  if (res?.status === 'failed' || res?.ok === false) {
    await ctx.admin.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: res?.error || 'render failed', failed_at: now } },
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'failed', error: res?.error || 'render failed' })
  }

  return NextResponse.json({ ok: true, status: 'rendering' })
}
