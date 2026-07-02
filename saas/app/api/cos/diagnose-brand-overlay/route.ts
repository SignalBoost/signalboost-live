// saas/app/api/cos/diagnose-brand-overlay/route.ts
// Deterministic diagnostic: runs renderBrandOverlayVideo() DIRECTLY on a real
// campaign's existing video — no cron, no chat, no waiting — and returns the
// full trace verbatim: probedDurationSec, overlay URL check, JSON2Video submit
// HTTP status, project id, and the vendor's exact error or the finished URL.
// Pure diagnosis: writes NOTHING to the database. Owner-only.
//
//   ?run=1            → newest campaign whose video is ready but not branded
//   ?run=1&id=<uuid>  → a specific campaign id
//
// A success costs a few JSON2Video credits and returns the branded URL (which
// the normal cron will also produce on its own schedule); a failure returns
// the exact reason the cron keeps hitting.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner only. Log in as the owner, then reload.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  if (searchParams.get('run') !== '1') {
    return NextResponse.json({
      ok: true,
      mode: 'dry',
      explain: 'Add ?run=1 to run the brand-overlay step directly on the newest unbranded ready video and see the full trace (JSON2Video project id, HTTP status, exact vendor error). Optionally add &id=<campaign uuid> to target a specific campaign. Writes nothing to the database.',
    })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase service credentials not configured' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const explicitId = String(searchParams.get('id') || '').trim()
  let campaign: any = null

  if (explicitId) {
    const { data } = await admin.from('cos_campaign_queue').select('*').eq('id', explicitId).single()
    campaign = data
  } else {
    const { data } = await admin
      .from('cos_campaign_queue')
      .select('*')
      .filter('metadata->video->>status', 'eq', 'ready')
      .order('created_at', { ascending: false })
      .limit(20)
    campaign = (data || []).find((c: any) => c

?.metadata?.video?.url && c?.metadata?.video?.branded !== true) || null
  }

  if (!campaign) {
    return NextResponse.json({ ok: false, error: 'No matching campaign found (need a ready, unbranded video, or pass a valid &id=).' }, { status: 404 })
  }

  const v = campaign.metadata?.video || {}
  const sourceUrl = String(v.unbrandedVoicedUrl || v.voicedUrl || v.url || '')
  const aspect: '16:9' | '9:16' = v.aspect === '9:16' || v.aspect === '16:9' ? v.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'

  const startedAt = Date.now()
  const result = await renderBrandOverlayVideo({ campaign, sourceUrl, aspect, lang: 'en' })

  return NextResponse.json({
    ok: result.ok,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    sourceUrl,
    aspect,
    tookMs: Date.now() - startedAt,
    result,
    priorState: {
      branded: v.branded ?? null,
      voiceError: v.voiceError ?? null,
      brandAttempts: v.brandAttempts ?? null,
      brandingExhausted: v.brandingExhausted ?? null,
    },
    verdict: result.ok
      ? `Overlay works — branded video produced at ${result.url}. The cron should succeed too; if it previously exhausted attempts (brandingExhausted), that flag must be cleared for it to retry.`
      : `Overlay failed. The debug trace above (phase, submitHttp, project, probedDurationSec, error) is the exact failure the cron keeps hitting. Also check json2video.com → Render logs for project "${(result as any)?.debug?.project || 'n/a'}" — the vendor's own log shows richer detail than their API returns.`,
  })
}
