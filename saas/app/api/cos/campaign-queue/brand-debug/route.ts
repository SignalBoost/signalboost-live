// saas/app/api/cos/campaign-queue/brand-debug/route.ts
// Admin diagnostic + credit-safe reset for the branded-video pipeline.
//   /api/cos/campaign-queue/brand-debug                 -> dump full video state (no writes)
//   /api/cos/campaign-queue/brand-debug?reset=1         -> clear retry state (attempts/error/lock)
//   /api/cos/campaign-queue/brand-debug?full=1          -> FULL re-render: also clears voiced/voicedUrl/branded/schema
//   ...append &id=<campaignId>  -> limit the reset to a single campaign (credit-safe test)
//
// This endpoint is the single source of truth for "which branch actually ran".
// After one render, read `displayUrlUsedByCosa`, `branded`, `brandSchemaVersion`
// and `voiceError` to know exactly what happened — no guessing.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

const BRAND_SCHEMA_VERSION = 7

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const q = new URL(req.url).searchParams
  const light = q.get('reset') === '1'
  const full = q.get('full') === '1'
  const onlyId = (q.get('id') || '').trim()

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', ['youtube', 'short_video'])
    .order('updated_at', { ascending: false })
    .limit(12)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // ---- Optional reset (writes) ----------------------------------------------
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

  // ---- Full read-out ---------------------------------------------------------
  const rows = (data || []).map((c: any) => {
    const v = (c.metadata && c.metadata.video) || {}
    const wiped = (light || full) && v.status === 'ready' && (!onlyId || c.id === onlyId)

    const branded = full && wiped ? false : (v.branded === true)
    const voicedUrl = full && wiped ? null : (v.voicedUrl || null)
    const schema = full && wiped ? null : (v.brandSchemaVersion || null)
    const displayUrl = voicedUrl || v.url || null

    return {
      id: c.id,
      channel: c.channel,
      status: c.status,
      updated_at: c.updated_at,
      video: {
        status: v.status || null,
        aspect: v.aspect || null,

        url: v.url || null,
        voicedUrl,
        displayUrlUsedByCosa: displayUrl,

        branded,
        brandSchemaVersion: schema,
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
      flags: {
        hasBaseUrl: !!v.url,
        hasVoicedUrl: !!voicedUrl,
        // Card shows voicedUrl even though it's not a confirmed branded render.
        isDisplayingFallbackOrOldVoicedUrl: !!voicedUrl && branded !== true,
        // Marked branded but missing the schema stamp -> an inconsistent writer touched it.
        isBrandedButSchemaMissing: branded === true && !schema,
        // Branded but on an older schema than current -> needs a re-render.
        isBrandedButStaleSchema: branded === true && !!schema && Number(schema) < BRAND_SCHEMA_VERSION,
      },
    }
  })

  return NextResponse.json(
    { ok: true, mode: full ? 'full' : light ? 'light' : 'view', schemaVersion: BRAND_SCHEMA_VERSION, onlyId: onlyId || null, cleared, count: rows.length, rows },
    { headers: { 'cache-control': 'no-store' } },
  )
}
