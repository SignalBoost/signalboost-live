// saas/app/api/cron/cos-brand-dispatch/route.ts
// Supabase-backed COSA branding watchdog.
//
// This is the live SaaS equivalent of the AI Studio dispatch controller idea:
// no Firestore, no Firebase function, and no fake local queue. The live pipeline
// stores campaign state in Supabase cos_campaign_queue and uses the existing
// GitHub Actions FFmpeg worker (brand-overlay.yml) to burn the SignalBoostAi
// banner into already-voiced videos.
//
// The watchdog wakes the branding worker only when campaigns are actually stuck
// at the 78% handoff: status=ready, unbrandedVoiced exists, branded final is
// missing, and overlay attempts are still available. It also clears stale
// branding locks so the next worker run can pick the campaign back up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 5
const STALE_LOCK_MINUTES = 10
const SCAN_LIMIT = 50

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function isCronRequest(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  return Boolean(secret && auth === `Bearer ${secret}`)
}

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

function ageMinutes(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function waitingLangs(video: any): string[] {
  const unbranded = video?.unbrandedVoiced || {}
  const branded = video?.brandedLangs || {}
  const attempts = video?.ghOverlayAttempts || {}
  return keys(unbranded).filter((lang) => {
    if (!unbranded[lang]) return false
    if (branded[lang]) return false
    return Number(attempts[lang] || 0) < MAX_ATTEMPTS
  })
}

function isWaitingForBrand(campaign: any): boolean {
  const video = campaign?.metadata?.video || null
  if (!video) return false
  if (video.status !== 'ready') return false
  if (video.branded === true && video.voicedUrl) return false
  return waitingLangs(video).length > 0
}

async function dispatchWorkflow(token: string) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
    },
  )

  if (res.status === 204) return { ok: true, status: res.status, error: null }
  return { ok: false, status: res.status, error: (await res.text()).slice(0, 700) }
}

async function patchWatchdog(sb: any, campaign: any, patch: Record<string, unknown>) {
  const video = campaign?.metadata?.video || {}
  await sb.from('cos_campaign_queue').update({
    metadata: {
      ...(campaign.metadata || {}),
      video: {
        ...video,
        ...patch,
      },
    },
  }).eq('id', campaign.id)
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sb = admin()
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  const now = new Date().toISOString()

  const { data: recent, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidates = (recent || []).filter(isWaitingForBrand)
  const staleLocks: any[] = []

  for (const campaign of candidates) {
    const video = campaign?.metadata?.video || {}
    const lock = video.brandingLock || null
    const lockAge = ageMinutes(lock?.at)
    if (lock && lockAge !== null && lockAge >= STALE_LOCK_MINUTES) {
      staleLocks.push({ id: campaign.id, title: String(campaign.title || '').slice(0, 80), lockAgeMinutes: lockAge, lock })
      await patchWatchdog(sb, campaign, {
        brandingLock: null,
        brandDispatchWatchdog: {
          at: now,
          reason: 'stale branding lock cleared by cron watchdog',
          previousLock: lock,
        },
      })
    }
  }

  if (!candidates.length) {
    return NextResponse.json({
      ok: true,
      dispatched: false,
      scanned: recent?.length || 0,
      waitingCount: 0,
      staleLocksCleared: staleLocks.length,
      note: 'No 78% banner-waiting campaigns found.',
    })
  }

  if (!token) {
    for (const campaign of candidates) {
      await patchWatchdog(sb, campaign, {
        brandDispatchWatchdog: {
          at: now,
          ok: false,
          reason: 'missing GITHUB_WRITE_TOKEN or GITHUB_TOKEN in Vercel env',
          waitingLangs: waitingLangs(campaign?.metadata?.video || {}),
        },
      })
    }
    return NextResponse.json({
      ok: false,
      dispatched: false,
      scanned: recent?.length || 0,
      waitingCount: candidates.length,
      error: 'No GITHUB_WRITE_TOKEN or GITHUB_TOKEN in Vercel env. Cannot dispatch brand-overlay.yml.',
    }, { status: 500 })
  }

  const dispatch = await dispatchWorkflow(token)

  for (const campaign of candidates) {
    const video = campaign?.metadata?.video || {}
    const langs = waitingLangs(video)
    const attempts = video.ghOverlayAttempts || {}
    await patchWatchdog(sb, campaign, {
      brandDispatchWatchdog: {
        at: now,
        ok: dispatch.ok,
        status: dispatch.status,
        error: dispatch.error,
        waitingLangs: langs,
        attempts: Object.fromEntries(langs.map((lang) => [lang, Number(attempts[lang] || 0)])),
        workflow: WORKFLOW_FILE,
        note: dispatch.ok
          ? 'GitHub FFmpeg brand-overlay workflow dispatched by Supabase watchdog.'
          : 'GitHub FFmpeg brand-overlay workflow dispatch failed; check token permissions.',
      },
    })
  }

  return NextResponse.json({
    ok: dispatch.ok,
    dispatched: dispatch.ok,
    status: dispatch.status,
    error: dispatch.error,
    scanned: recent?.length || 0,
    waitingCount: candidates.length,
    staleLocksCleared: staleLocks.length,
    staleLocks,
    waitingCampaigns: candidates.slice(0, 20).map((campaign: any) => {
      const video = campaign?.metadata?.video || {}
      const langs = waitingLangs(video)
      const attempts = video.ghOverlayAttempts || {}
      return {
        id: campaign.id,
        title: String(campaign.title || '').slice(0, 80),
        langs,
        attempts: Object.fromEntries(langs.map((lang) => [lang, Number(attempts[lang] || 0)])),
        lockAgeMinutes: ageMinutes(video?.brandingLock?.at),
      }
    }),
    note: dispatch.ok
      ? 'brand-overlay.yml dispatched. The worker should burn final banners and update brandedLangs/voicedUrl.'
      : 'GitHub workflow dispatch failed. Check GITHUB_WRITE_TOKEN permissions.',
  }, { status: dispatch.ok ? 200 : 502 })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
