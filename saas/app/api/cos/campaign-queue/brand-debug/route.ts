// saas/app/api/cos/campaign-queue/brand-debug/route.ts
// TEMP admin diagnostic + reset. Signed in as admin:
//   /api/cos/campaign-queue/brand-debug          -> dump stored video state
//   /api/cos/campaign-queue/brand-debug?reset=1  -> clear stuck retry state so
//                                                   the branded cron reprocesses
//
// Reset clears brandAttempts / voiceError / brandingLock on every 'ready' video
// campaign (leaves url/status/voiced intact), so campaigns that already hit the
// retry cap with the old bad voice get a fresh pass with the corrected voice.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const reset = new URL(req.url).searchParams.get('reset') === '1'

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', ['youtube', 'short_video'])
    .order('updated_at', { ascending: false })
    .limit(12)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let cleared = 0
  if (reset) {
    for (const c of data || []) {
      const v = (c.metadata && c.metadata.video) || {}
      if (v.status !== 'ready') continue
      const nv = { ...v, brandAttempts: {}, voiceError: null, brandingLock: null }
      await ctx.admin.from('cos_campaign_queue').update({
        metadata: { ...(c.metadata || {}), video: nv },
      }).eq('id', c.id)
      cleared++
    }
  }

  const rows = (data || []).map((c: any) => {
    const v = (c.metadata && c.metadata.video) || {}
    return {
      id: c.id,
      channel: c.channel,
      status: c.status,
      updated_at: c.updated_at,
      video: {
        status: v.status || null,
        aspect: v.aspect || null,
        hasBrollUrl: !!v.url,
        hasVoicedUrl: !!v.voicedUrl,
        branded: v.branded || false,
        voicedLangs: Object.keys(v.voiced || {}),
        brandAttempts: reset ? {} : (v.brandAttempts || {}),
        brandingLock: reset ? null : (v.brandingLock || null),
        voiceError: reset ? null : (v.voiceError || null),
      },
    }
  })

  return NextResponse.json({ ok: true, reset, cleared, count: rows.length, rows }, { headers: { 'cache-control': 'no-store' } })
}
