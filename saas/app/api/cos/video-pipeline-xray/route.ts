// saas/app/api/cos/video-pipeline-xray/route.ts
// ZERO-COST full video-pipeline diagnostic. Spends NO render credits, writes
// NOTHING to the database. One GET returns the true state of every stage:
//
//   1. Env keys present in Vercel (FAL, ElevenLabs, JSON2Video, cron secret)
//   2. Brand overlay PNG reachable from the server (both aspects)
//   3. ElevenLabs key valid (free /v1/user call)
//   4. JSON2Video key valid (free GET — no render submitted)
//   5. Last 15 video campaigns: stage, stored voiceError, brandDebug,
//      attempts, and whether the BACKLOG_CUTOFF guard is silently skipping them
//   6. Count of ready-but-unbranded campaigns excluded by the cutoff
//
// Owner-only. Open in the browser while logged in as owner:
//   /api/cos/video-pipeline-xray

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SITE = 'https://www.saas.signalboostapp.com'
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'

async function checkOverlay(aspect: string): Promise<{ ok: boolean; status?: number; contentType?: string; error?: string }> {
  try {
    const res = await fetch(`${SITE}/api/brand-overlay?a=${aspect}`, { redirect: 'follow' })
    const contentType = res.headers.get('content-type') || ''
    return { ok: res.ok && contentType.includes('image'), status: res.status, contentType }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch failed' }
  }
}

async function checkElevenLabs(): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return { ok: false, detail: 'ELEVENLABS_API_KEY not set' }
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
    if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 300) }
    const d: any = await res.json().catch(() => ({}))
    return { ok: true, status: res.status, detail: `tier=${d?.tier || '?'} chars=${d?.character_count ?? '?'}/${d?.character_limit ?? '?'}` }
  } catch (e: any) {
    return { ok: false, detail: e?.message || 'fetch failed' }
  }
}

async function checkJson2Video(): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) return { ok: false, detail: 'JSON2VIDEO_API_KEY not set' }
  try {
    // GET with a bogus project id: a valid key returns a JSON "not found"-style
    // body; an invalid key returns 401/403. No credits are consumed by a GET.
    const res = await fetch('https://api.json2video.com/v2/movies?project=xraykeycheck', {
      headers: { 'x-api-key': key },
    })
    const body = (await res.text().catch(() => '')).slice(0, 300)
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, detail: `key rejected: ${body}` }
    return { ok: true, status: res.status, detail: body }
  } catch (e: any) {
    return { ok: false, detail: e?.message || 'fetch failed' }
  }
}

export async function GET(_req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner only. Log in as the owner, then reload.' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase service credentials not configured' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const env = {
    FAL_KEY: Boolean(process.env.FAL_KEY),
    ELEVENLABS_API_KEY: Boolean(process.env.ELEVENLABS_API_KEY),
    JSON2VIDEO_API_KEY: Boolean(process.env.JSON2VIDEO_API_KEY),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    COS_BRAND_SINCE_override: process.env.COS_BRAND_SINCE || null,
  }

  const [overlay16x9, overlay9x16, elevenlabs, json2video] = await Promise.all([
    checkOverlay('16x9'),
    checkOverlay('9x16'),
    checkElevenLabs(),
    checkJson2Video(),
  ])

  // Last 15 campaigns that have any video metadata at all.
  const { data: recent } = await admin
    .from('cos_campaign_queue')
    .select('id, title, channel, created_at, metadata')
    .not('metadata->video', 'is', null)
    .order('created_at', { ascending: false })
    .limit(15)

  const cutoffMs = Date.parse(BACKLOG_CUTOFF)
  const campaigns = (recent || []).map((c: any) => {
    const v = c?.metadata?.video || {}
    const createdMs = c.created_at ? Date.parse(c.created_at) : 0
    return {
      id: c.id,
      title: String(c.title || '').slice(0, 60),
      channel: c.channel,
      created_at: c.created_at,
      blockedByCutoff: !createdMs || createdMs < cutoffMs,
      stage: v.status || null, // rendering | ready | failed
      hasKlingUrl: Boolean(v.url),
      renderError: v.error || null,
      branded: v.branded ?? null,
      brandedLangs: v.brandedLangs || null,
      brandAttempts: v.brandAttempts || null,
      brandingExhausted: v.brandingExhausted ?? null,
      brandingLock: v.brandingLock || null,
      voiceError: v.voiceError || null,
      brandDebug: v.brandDebug || null,
      voicedUrl: v.voicedUrl || null,
    }
  })

  // How many ready campaigns is the cutoff guard silently hiding from the cron?
  const { count: excludedByCutoff } = await admin
    .from('cos_campaign_queue')
    .select('id', { count: 'exact', head: true })
    .filter('metadata->video->>status', 'eq', 'ready')
    .lt('created_at', BACKLOG_CUTOFF)

  const hints: string[] = []
  const nowMs = Date.now()
  if (nowMs < cutoffMs) hints.push(`BACKLOG_CUTOFF (${BACKLOG_CUTOFF}) is in the FUTURE — the brand cron is skipping EVERYTHING right now.`)
  if ((excludedByCutoff || 0) > 0) hints.push(`${excludedByCutoff} ready campaign(s) are older than BACKLOG_CUTOFF and will NEVER be branded by the cron. To brand one, set Vercel env COS_BRAND_SINCE to an earlier date or create a fresh campaign.`)
  if (campaigns.length && campaigns.every((c) => c.blockedByCutoff)) hints.push('ALL recent video campaigns predate the cutoff — this alone explains "nothing happens".')
  if (!overlay16x9.ok || !overlay9x16.ok) hints.push('Brand overlay PNG is NOT reachable — JSON2Video cannot fetch the banner; every overlay render fails at verify-overlay.')
  if (!elevenlabs.ok) hints.push('ElevenLabs key invalid/exhausted — the voice stage fails before JSON2Video is ever reached.')
  if (!json2video.ok) hints.push('JSON2Video key rejected — the banner stage fails at submit.')
  const firstErr = campaigns.find((c) => c.voiceError)
  if (firstErr) hints.push(`Most recent stored pipeline error → campaign ${firstErr.id}: ${String(firstErr.voiceError).slice(0, 300)}`)
  if (!hints.length) hints.push('No structural blockers found. Check voiceError/brandDebug per campaign below, or run /api/cos/diagnose-brand-overlay?run=1 for a live overlay trace.')

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    backlogCutoff: BACKLOG_CUTOFF,
    env,
    overlay: { '16x9': overlay16x9, '9x16': overlay9x16 },
    elevenlabs,
    json2video,
    excludedByCutoff: excludedByCutoff || 0,
    campaigns,
    hints,
  })
}
