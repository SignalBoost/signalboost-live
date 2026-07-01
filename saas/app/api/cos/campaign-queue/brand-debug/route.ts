// saas/app/api/cos/campaign-queue/brand-debug/route.ts
// TEMP admin diagnostic + reset. Signed in as admin:
//   /api/cos/campaign-queue/brand-debug             -> dump stored video state
//   /api/cos/campaign-queue/brand-debug?reset=1     -> clear retry state (attempts/error/lock)
//   /api/cos/campaign-queue/brand-debug?full=1      -> FULL re-render: also clears voiced/voicedUrl/branded
//   ...append &id=<campaignId>  -> limit the reset to a single campaign (credit-safe test)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const q = new URL(req.url).searchParams
  const light = q.get('reset') === '1'
  const full = q.get('full') === '1'
  const onlyId = (q.get('id') || '').trim()

  let query = ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', ['youtube', 'short_video'])
    .order('updated_at', { ascending: false })
    .limit(12)
  if (onlyId) query = query.eq('id', onlyId)
  const { data, error } = await query

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let cleared = 0
  if (light || full) {
    for (const c of data || []) {
      const v = (c.metadata && c.metadata.video) || {}
      if (v.status !== 'ready') continue
      if (onlyId && c.id !== onlyId) continue
      const nv: any = { ...v, brandAttempts: {}, voiceError: null, brandingLock: null }
      if (full) {
        nv.voiced = {}
        nv.voicedUrl = null
        nv.branded = false
        nv.brandSchemaVersion = null
        nv.brandText = null
        nv.brandedAt = null
      }
      await ctx.admin.from('cos_campaign_queue').update({
        metadata: { ...(c.metadata || {}), video: nv },
      }).eq('id', c.id)
      cleared++
    }
  }

  const rows = (data || []).map((c: any) => {
    const v = (c.metadata && c.metadata.video) || {}
    const wiped = (light || full) && v.status === 'ready' && (!onlyId || c.id === onlyId)
    return {
      id: c.id,
      channel: c.channel,
      status: c.status,
      updated_at: c.updated_at,
      video: {
        status: v.status || null,
        aspect: v.aspect || null,

        url: v.url || null,
        voicedUrl: full && wiped ? null : (v.voicedUrl || null),
        displayUrlUsedByCosa: full && wiped ? (v.url || null) : (v.voicedUrl || v.url || null),

        branded: full && wiped ? false : v.branded === true,
        brandSchemaVersion: full && wiped ? null : (v.brandSchemaVersion || null),
        brandText: full && wiped ? null : (v.brandText || null),
        brandedAt: full && wiped ? null : (v.brandedAt || null),

        voiceError: wiped ? null : (v.voiceError || null),
        voiced: full && wiped ? {} : (v.voiced || {}),
        voicedLangs: full && wiped ? [] : Object.keys(v.voiced || {}),

        brandAttempts: wiped ? {} : (v.brandAttempts || {}),
        brandingLock: wiped ? null : (v.brandingLock || null),

        requestId: v.requestId || null,
        model: v.model || null,
        ready_at: v.ready_at || null,
        error: v.error || null,
      },
      hasBaseUrl: !!v.url,
      hasVoicedUrl: full && wiped ? false : !!v.voicedUrl,
      isDisplayingFallbackOrOldVoicedUrl: full && wiped ? false : !!v.voicedUrl && v.branded !== true,
      isBrandedButSchemaMissing: full && wiped ? false : v.branded === true && !v.brandSchemaVersion,
    }
  })

  return NextResponse.json({ ok: true, mode: full ? 'full' : light ? 'light' : 'view', onlyId: onlyId || null, cleared, count: rows.length, rows }, { headers: { 'cache-control': 'no-store' } })
}
