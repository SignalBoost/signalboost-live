// saas/app/api/cos/campaign-queue/brand-debug/route.ts
// TEMP admin diagnostic. Open in a browser while signed in as admin:
//   /api/cos/campaign-queue/brand-debug
// Returns the exact stored state of recent video campaigns so we can see why a
// campaign shows a 5s clip: is the render 'ready', did the branded cron write a
// voicedUrl, how many attempts, is it locked, and what error (if any) it recorded.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', ['youtube', 'short_video'])
    .order('updated_at', { ascending: false })
    .limit(6)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

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
        brandAttempts: v.brandAttempts || {},
        brandingLock: v.brandingLock || null,
        voiceError: v.voiceError || null,
      },
    }
  })

  return NextResponse.json({ ok: true, count: rows.length, rows }, { headers: { 'cache-control': 'no-store' } })
}
